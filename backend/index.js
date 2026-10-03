import express from "express";
import cors from "cors";
import "dotenv/config";
import { randomBytes } from "node:crypto";
import ImageKit from "@imagekit/nodejs";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import SharedChat from "./models/sharedChat.js";
import UserChats from "./models/userChats.js";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { getGeminiModel } from "./gemini.js";
import { createLiveTokenRequest } from "./liveVoice.js";

const app = express();

const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS || "").split(","),
  "https://nexa-ai-frontend-eta.vercel.app",
].map((origin) => origin.trim()).filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());


// ===============================
// MongoDB Connection
// ===============================

let isConnected = false;

const connect = async () => {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO);
    isConnected = true;
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
};


// ===============================
// ImageKit Configuration
// ===============================

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

const getChatTimestamp = (chat, field) => {
  const timestamp = new Date(chat[field] || chat.createdAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareChatsByRecency = (first, second) => {
  const pinnedOrder = Number(Boolean(second.pinned)) - Number(Boolean(first.pinned));
  if (pinnedOrder) return pinnedOrder;

  const activityOrder = getChatTimestamp(second, "lastMessageAt") - getChatTimestamp(first, "lastMessageAt");
  if (activityOrder) return activityOrder;

  const createdOrder = getChatTimestamp(second, "createdAt") - getChatTimestamp(first, "createdAt");
  if (createdOrder) return createdOrder;

  return String(first._id).localeCompare(String(second._id));
};


// ===============================
// ImageKit Authentication
// ===============================

app.get("/api/upload", (req, res) => {
  try {
    const result = imagekit.helper.getAuthenticationParameters();

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});


// ===============================
// Gemini AI
// ===============================

app.post("/api/gemini", clerkMiddleware(), async (req, res) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: "User not authenticated",
      });
    }

    const { text, image } = req.body;

    if (!text) {
      return res.status(400).json({
        error: "Message text is required",
      });
    }

    const chat = getGeminiModel().startChat();

    // Prepare Gemini input
    const prompt = image
      ? [image, text]
      : [text];

    // Stream Gemini response
    const result = await chat.sendMessageStream(prompt);

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();

      if (chunkText) {
        res.write(chunkText);
      }
    }

    const completedResponse = await result.response;
    const finishReason = completedResponse.candidates?.[0]?.finishReason;

    if (finishReason && finishReason !== "STOP") {
      console.warn("Gemini response finished early:", finishReason);
    }

    res.end();

  } catch (err) {
    console.error("Gemini error:", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || "Gemini request failed",
      });
    } else {
      res.end();
    }
  }
});

// ===============================
// Provision a short-lived Gemini Live session token
// ===============================

app.post("/api/voice/session", clerkMiddleware(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured for live voice");
    return res.status(503).json({ error: "Live voice is not configured" });
  }

  const model = (process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live").replace(/^models\//, "");
  const liveConfig = {
    responseModalities: ["AUDIO"],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    systemInstruction: {
      parts: [{
        text: "You are Nexa AI, a warm, clear, and helpful voice assistant. Speak naturally and concisely. Respond in the language the user speaks.",
      }],
    },
  };

  try {
    const tokenResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(createLiveTokenRequest(model, liveConfig)),
    });

    const tokenResult = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("Gemini Live token request failed:", tokenResult.error?.message || tokenResponse.status);
      return res.status(502).json({ error: "Unable to start live voice. Please try again." });
    }

    if (!tokenResult.name) {
      console.error("Gemini Live token response did not include a token name");
      return res.status(502).json({ error: "Unable to start live voice. Please try again." });
    }

    return res.status(200).json({ token: tokenResult.name, model, config: liveConfig });
  } catch (err) {
    console.error("Gemini Live token request failed:", err);
    return res.status(502).json({ error: "Unable to start live voice. Please try again." });
  }
});


// ===============================
// Create New Chat
// ===============================

app.post("/api/chats/voice", clerkMiddleware(), async (req, res) => {
  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    await connect();

    const chat = await new Chat({ userId, history: [] }).save();
    const createdAt = chat.createdAt || new Date();
    const userChats = await UserChats.findOneAndUpdate(
      { userId },
      {
        $push: {
          chats: {
            _id: chat._id,
            title: "Voice conversation",
            pinned: false,
            createdAt,
            lastMessageAt: createdAt,
          },
        },
      },
      { new: true, upsert: true }
    );

    if (!userChats) {
      await Chat.deleteOne({ _id: chat._id, userId });
      return res.status(500).json({ error: "Unable to create voice conversation" });
    }

    return res.status(201).json({ id: String(chat._id) });
  } catch (err) {
    console.error("Error creating voice conversation:", err);
    return res.status(500).json({ error: "Unable to create voice conversation" });
  }
});

app.post("/api/chats", clerkMiddleware(), async (req, res) => {
  await connect();

  const { userId } = getAuth(req);

  if (!userId) {
    console.error("User not authenticated");

    return res.status(401).json({
      error: "User not authenticated",
    });
  }

  const { text, img } = req.body;

  try {
    // CREATE NEW CHAT
    const newChat = new Chat({
      userId: userId,
      history: [
        {
          role: "user",
          parts: [
            {
              text,
            },
          ],
          ...(img && { img }),
        },
      ],
    });

    const savedChat = await newChat.save();
    const createdAt = savedChat.createdAt || new Date();

    // CHECK IF USER EXISTS
    const userChats = await UserChats.find({
      userId: userId,
    });

    // IF USER DOESN'T EXIST
    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [
          {
            _id: savedChat._id,
            title: text.substring(0, 40),
            pinned: false,
            createdAt,
            lastMessageAt: createdAt,
          },
        ],
      });

      await newUserChats.save();

    } else {

      // IF USER EXISTS
      await UserChats.updateOne(
        {
          userId: userId,
        },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
              pinned: false,
              createdAt,
              lastMessageAt: createdAt,
            },
          },
        }
      );
    }

    res.status(200).send(newChat._id);

  } catch (err) {
    console.log(err);

    res.status(500).send(
      "Error creating chat"
    );
  }
});

// ===============================
// Persist a completed voice turn
// ===============================

app.post("/api/chats/:id/voice-turn", clerkMiddleware(), async (req, res) => {
  const { userId } = getAuth(req);
  const body = req.body || {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  const turnId = typeof body.turnId === "string" ? body.turnId : "";

  if (!userId) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  if (
    !question ||
    !answer ||
    question.length > 20000 ||
    answer.length > 20000 ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(turnId)
  ) {
    return res.status(400).json({ error: "A valid voice conversation turn is required" });
  }

  try {
    await connect();

    const updatedChat = await Chat.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        history: { $not: { $elemMatch: { voiceTurnId: turnId } } },
      },
      {
        $push: {
          history: {
            $each: [
              { role: "user", parts: [{ text: question }], voiceTurnId: turnId },
              { role: "model", parts: [{ text: answer }], voiceTurnId: turnId },
            ],
          },
        },
      },
      { new: true }
    );

    if (!updatedChat) {
      const existingChat = await Chat.findOne({
        _id: req.params.id,
        userId,
        "history.voiceTurnId": turnId,
      }).select("history updatedAt");

      if (!existingChat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      await UserChats.updateOne(
        { userId, "chats._id": req.params.id },
        {
          $set: {
            "chats.$.lastMessageAt": existingChat.updatedAt,
            ...(existingChat.history.length === 2 && {
              "chats.$.title": question.slice(0, 40),
            }),
          },
        }
      );
      return res.status(200).json({ saved: true, duplicate: true });
    }

    await UserChats.updateOne(
      { userId, "chats._id": req.params.id },
      {
        $set: {
          "chats.$.lastMessageAt": new Date(),
          ...(updatedChat.history.length === 2 && {
            "chats.$.title": question.slice(0, 40),
          }),
        },
      }
    );

    return res.status(200).json({ saved: true });
  } catch (err) {
    console.error("Error saving voice conversation turn:", err);
    return res.status(500).json({ error: "Unable to save voice conversation turn" });
  }
});


// ===============================
// Get User Chats
// ===============================

  app.get("/api/userchats", clerkMiddleware(), async (req, res) => {

  const auth = getAuth(req);

  const { userId } = auth;

  if (!userId) {
    return res.status(401).json({
      error: "User not authenticated",
    });
  }

  try {
    await connect();

    const userChats = await UserChats.findOne({ userId }).lean();
    const sidebarChats = userChats?.chats || [];
    const chatsMissingActivity = sidebarChats.filter((chat) => !chat.lastMessageAt);
    const chatActivity = chatsMissingActivity.length
      ? await Chat.find({
          userId,
          _id: { $in: chatsMissingActivity.map((chat) => chat._id) },
        })
          .select("_id createdAt updatedAt")
          .lean()
      : [];
    const activityByChatId = new Map(
      chatActivity.map((chat) => [String(chat._id), chat.updatedAt || chat.createdAt])
    );

    const chats = sidebarChats
      .map((chat) => ({
        ...chat,
        lastMessageAt:
          chat.lastMessageAt ||
          activityByChatId.get(String(chat._id)) ||
          chat.createdAt,
      }))
      .sort(compareChatsByRecency);

    res.status(200).json(chats);

  } catch (err) {
    console.log("Error fetching user chats:", err);

    res.status(500).json({
      error: "Error fetching user chats",
    });
  }
});

// ===============================
// Update Sidebar Chat
// ===============================

app.patch(
  "/api/userchats/:id",
  clerkMiddleware(),
  async (req, res) => {
    const { userId } = getAuth(req);
    const { title, pinned } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const updates = {};

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "A chat title is required" });
      }

      updates["chats.$.title"] = title.trim().slice(0, 80);
    }

    if (pinned !== undefined) {
      if (typeof pinned !== "boolean") {
        return res.status(400).json({ error: "Pinned must be a boolean" });
      }

      updates["chats.$.pinned"] = pinned;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No chat changes supplied" });
    }

    try {
      await connect();

      const userChats = await UserChats.findOneAndUpdate(
        { userId, "chats._id": req.params.id },
        { $set: updates },
        { new: true }
      );

      if (!userChats) {
        return res.status(404).json({ error: "Chat not found" });
      }

      const updatedChat = userChats.chats.find(
        (chat) => String(chat._id) === req.params.id
      );

      return res.status(200).json(updatedChat);
    } catch (err) {
      console.error("Error updating sidebar chat:", err);
      return res.status(500).json({ error: "Error updating chat" });
    }
  }
);

// ===============================
// Delete Chat
// ===============================

app.delete(
  "/api/chats/:id",
  clerkMiddleware(),
  async (req, res) => {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    try {
      await connect();

      const deletedChat = await Chat.findOneAndDelete({
        _id: req.params.id,
        userId,
      });

      if (!deletedChat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      await UserChats.updateOne(
        { userId },
        { $pull: { chats: { _id: req.params.id } } }
      );

      return res.status(204).send();
    } catch (err) {
      console.error("Error deleting chat:", err);
      return res.status(500).json({ error: "Error deleting chat" });
    }
  }
);

// ===============================
// Create or refresh a shared chat snapshot
// ===============================

app.post(
  "/api/chats/:id/share",
  clerkMiddleware(),
  async (req, res) => {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    try {
      await connect();

      const chat = await Chat.findOne({
        _id: req.params.id,
        userId,
      }).select("history");

      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      const sidebarChat = await UserChats.findOne(
        { userId, "chats._id": req.params.id },
        { "chats.$": 1 }
      );
      const title = sidebarChat?.chats[0]?.title || "Shared conversation";
      const snapshot = {
        userId,
        title,
        history: chat.history.map((message) => ({
          role: message.role,
          parts: message.parts.map((part) => ({ text: part.text })),
          ...(message.img && { img: message.img }),
        })),
      };

      const sharedChat = await SharedChat.findOneAndUpdate(
        { chatId: req.params.id, userId },
        {
          $set: snapshot,
          $setOnInsert: {
            chatId: req.params.id,
            shareId: randomBytes(32).toString("hex"),
          },
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.status(200).json({ shareId: sharedChat.shareId });
    } catch (err) {
      console.error("Error creating shared chat:", err);
      return res.status(500).json({ error: "Unable to create a shared link" });
    }
  }
);

// ===============================
// Get public shared chat snapshot
// ===============================

app.get("/api/shared-chats/:shareId", async (req, res) => {
  try {
    await connect();

    const sharedChat = await SharedChat.findOne({ shareId: req.params.shareId })
      .select("title history createdAt")
      .lean();

    if (!sharedChat) {
      return res.status(404).json({ error: "Shared conversation not found" });
    }

    return res.status(200).json(sharedChat);
  } catch (err) {
    console.error("Error fetching shared chat:", err);
    return res.status(500).json({ error: "Unable to load shared conversation" });
  }
});

// ===============================
// Get Single Chat
// ===============================

app.get(
  "/api/chats/:id",
  clerkMiddleware(),
  async (req, res) => {

    await connect();

    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: "User not authenticated",
      });
    }

    try {
      const chat = await Chat.findOne({
        _id: req.params.id,
        userId,
      });
      if (!chat) return res.status(404).json({ error: "Chat not found" });
      res.status(200).send(chat);

    } catch (err) {
      console.log(err);

      res.status(500).send(
        "Error fetching chat"
      );
    }
  }
);


// ===============================
// Update Chat
// ===============================

app.put(
  "/api/chats/:id",
  clerkMiddleware(),
  async (req, res) => {

    await connect();

    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: "User not authenticated",
      });
    }

    const {
      question,
      answer,
      img,
    } = req.body;

    const newItems = [
      ...(question
        ? [
            {
              role: "user",
              parts: [
                {
                  text: question,
                },
              ],
              ...(img && {
                img,
              }),
            },
          ]
        : []),

      {
        role: "model",
        parts: [
          {
            text: answer,
          },
        ],
      },
    ];

    try {
      const updatedChat = await Chat.updateOne(
        {
          _id: req.params.id,
          userId,
        },
        {
          $push: {
            history: {
              $each: newItems,
            },
          },
        }
      );

      if (!updatedChat.matchedCount) {
        return res.status(404).json({ error: "Chat not found" });
      }

      await UserChats.updateOne(
        { userId, "chats._id": req.params.id },
        { $set: { "chats.$.lastMessageAt": new Date() } }
      );

      res.status(200).send(updatedChat);

    } catch (err) {
      console.log(err);

      res.status(500).send(
        "Error adding conversation!"
      );
    }
  }
);


// ===============================
// Error Handler
// ===============================

app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(401).send(
    "User not authenticated"
  );
});


// ===============================
// MongoDB Initial Connection
// ===============================

connect();


// ===============================
// Export Express App
// ===============================

export default app;
