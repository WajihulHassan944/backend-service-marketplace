import express from "express";
import userRouter from "./routes/user.js";
import gigsRouter from "./routes/gigs.js";
import ordersRouter from "./routes/orders.js";
import messagesRouter from "./routes/messages.js";
import categoryRouter from "./routes/category.js";
import { config } from "dotenv";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.js";
import cors from "cors";

export const app = express();

config({
  path: "./data/config.env",
});

// Using Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
// Using routes
app.use("/api/users", userRouter);
app.use("/api/category", categoryRouter);
app.use("/api/gigs", gigsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/orders", ordersRouter);

app.get("/", (req, res) => {
  res.send("Nice working backend by Muhammad Furqan Wajih");
});

// Using Error Middleware
app.use(errorMiddleware);
