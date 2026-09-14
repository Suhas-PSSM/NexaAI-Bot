import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ImageKit from "@imagekit/nodejs";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { clerkMiddleware, getAuth } from "@clerk/express";
import model from "./gemini.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
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

    // Start Gemini chat
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [
            {
              text: "You are a helpful assistant.",
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "I am a helpful assistant.",
            },
          ],
        },
      ],
    });

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
// Create New Chat
// ===============================

app.post("/api/chats", clerkMiddleware(), async (req, res) => {
  await connect();

  const { userId } = getAuth(req);

  if (!userId) {
    console.error("User not authenticated");

    return res.status(401).json({
      error: "User not authenticated",
    });
  }

  const { text } = req.body;

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
        },
      ],
    });

    const savedChat = await newChat.save();

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
// Get User Chats
// ===============================

  app.get("/api/userchats", clerkMiddleware(), async (req, res) => {

  const auth = getAuth(req);

  console.log("========== CLERK DEBUG ==========");
  console.log("userId:", auth.userId);
  console.log("sessionId:", auth.sessionId);
  console.log("========== END DEBUG ==========");

  const { userId } = auth;

  if (!userId) {
    return res.status(401).json({
      error: "User not authenticated",
    });
  }

  try {
    await connect();

    const userChats = await UserChats.findOne({ userId });

    res.status(200).json(userChats?.chats || []);

  } catch (err) {
    console.log("Error fetching user chats:", err);

    res.status(500).json({
      error: "Error fetching user chats",
    });
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