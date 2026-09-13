import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ImageKit from "@imagekit/nodejs";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { clerkMiddleware, getAuth } from '@clerk/express'

dotenv.config();

const app = express();

app.use(
  cors({
  origin:process.env.CLIENT_URL,
  credentials:true,
})
);

app.use(express.json());

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

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

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

// app.get("/api/test", clerkMiddleware(), (req, res) => {
//   const { userId } = getAuth(req);
//   if (!userId) {
//     console.error("User not authenticated");
//     return res.status(401).send("User not authenticated");
//   }
//   console.log("Success!");
//   res.send("Success!");
// });

app.post("/api/chats", clerkMiddleware(), async (req, res) => { 
  await connect();
 const {userId} = getAuth(req);

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
    history: [{role: "user", parts: [{text}]}]
 })

 const savedChat = await newChat.save();

//  CHECK IF USER EXISTS
  const userChats = await UserChats.find({userId: userId});

  // IF DOESN'T EXIST, CREATE NEW USER CHATS AND ADD THE NEW CHAT TO THE CHATS ARRAY
  if(!userChats.length){
    const newUserChats = new UserChats({
      userId: userId,
      chats: [{_id: savedChat._id, title: text.substring(0,40),},],
    });

    await newUserChats.save();
  }else{
    // IF EXISTS, ADD THE CHAT TO THE EXISTING ARRAY
    await UserChats.updateOne(
      { userId: userId },
      { $push: { chats: { _id: savedChat._id, title: text.substring(0,40) } } }
    );
  }
  res.status(200).send(newChat._id);
}catch (err) {
    console.log(err);
    res.status(500).send("Error creating chat");
  }
});

app.get("/api/userchats", clerkMiddleware(), async (req, res) => {
  await connect();
  const { userId } = getAuth(req);

  try {
    const userChats = await UserChats.find({ userId});
    res.status(200).send(userChats[0].chats);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching user chats");
  }
});

app.get("/api/chats/:id", clerkMiddleware(), async (req, res) => {
  await connect();
  const { userId } = getAuth(req);

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat");
  }
});

app.put("/api/chats/:id", clerkMiddleware(), async (req, res) => {
  await connect();
   const { userId } = getAuth(req);
  
   const {question, answer, img} = req.body;

   const newItems = [
    ...(question 
      ? [{role: "user", parts: [{text: question}], ...(img && { img }) }]
      : []),
    {role: "model", parts: [{text: answer}]},
   ];

  try {
    const updatedChat = await Chat.updateOne({ _id: req.params.id, userId },
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
    res.status(500).send("Error adding conversation!");
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(401).send('User not authenticated');
  });

connect();

export default app;