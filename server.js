require("dotenv").config({});

const http = require("http");
const express = require("express");
const path = require("path");
const socket = require("socket.io");
const mongoose = require("mongoose");
const app = express();
const server = http.createServer(app);
const io = socket(server);

const PORT = process.env.PORT || 3000;

const userController = require("./controllers/user.controller");
const state = {
  conferenceId: "abcd-efg",
  mongoURI:
    process.env.MONGOURI ||
    "mongodb+srv://2xcel:PCRKTYvOmKxr9A8z@cluster0.fkxfi.mongodb.net/conferenceDB?authSource=admin&replicaSet=atlas-bootni-shard-0&w=majority&readPreference=primary&retryWrites=true&ssl=true",
};

app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static("public"));

app.get("/", (req, res, next) => {
  const file = path.resolve(path.join(__dirname, "public", "index.html"));
  return res.status(200).sendFile(file);
});

app.post("/", (req, res) => {
  return res
    .status(200)
    .redirect(`/${state.conferenceId}?username=${req.body.username}`);
});

app.get(`/${state.conferenceId}`, (req, res) => {
  const file = path.resolve(path.join(__dirname, "public", "conference.html"));
  return res.status(200).sendFile(file);
});

//Socket: listen for new connection
io.on("connection", (socket) => {
  socket.on("user-joined", async (username) => {
    const payload = {
      user: {
        username,
        userId: socket.id,
      },
    };
    //1. Enable user speech, if no users is active
    if (!(await userController.getActiveUser())) {
      payload.user.active = true;
      payload.isActiveUser = true;
    }
    //2. Insert user in queue
    payload.user.index = await userController.insertUser(payload.user);
    //3. Add user in conference room
    socket.join(state.conferenceId);
    //4. Emit user payload to all users in room
    socket.emit("you", payload);
    socket.to(state.conferenceId).emit("user-joined", payload);
  });

  //1. RECEIVE CALL FROM ROOM MEMBERS
  socket.on("call", async ({ userId, offer }) => {
    const caller = await userController.getUser(socket.id);
    socket.to(userId).emit("call", {
      caller, //caller details
      isActive: caller.active, //caller speech status
      offer, //caller offer
    });
  });

  //2. RECEIVER NEW USER CALL RESPONSE
  socket.on("answer", ({ caller, answer }) => {
    socket.to(caller).emit("answer", {
      responder: socket.id,
      answer,
    });
  });

  //3. EXCHANGE NETWORK DETAILS
  socket.on("ICE-Candidate", ({ receiver, candidate }) => {
    socket.to(receiver).emit("ICE-Candidate", {
      sender: socket.id,
      candidate, //network details of sender
    });
  });

  socket.on("speech-completed", async () => {
    const prevUserIndex = await userController.disableSpeech(socket.id);
    const newActiveUser = await userController.assignSpeech(prevUserIndex + 1);
    io.to(state.conferenceId).emit("new-speech-assigned", newActiveUser);
  });

  socket.on("message", (message) => {
    socket.to(state.conferenceId).emit("message", message);
  });

  socket.on("disconnect", async () => {
    try {
      //Get Current Active User
      let activeUser = null;
      const user = await userController.removeUser(socket.id);
      //Assign speech to next user, if disconnected user was speaking
      if (user.active)
        activeUser = await userController.assignSpeech(user.index);
      //Inform other user about disconnection and speech assign
      socket.to(state.conferenceId).emit("user-disconnect", {
        userId: user.userId,
        activeUser,
      });
    } catch (err) {
      console.log("Disconnect Error");
      console.log(err.message);
    }
  });
});

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(state.mongoURI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log("Server is up and running!");
  });
});
