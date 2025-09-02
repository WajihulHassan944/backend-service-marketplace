import { config } from "dotenv";
import express from "express";
import userRouter from "./routes/user.js";
import notificationRouter from "./routes/notification.js";
import emailRouter from "./routes/email.js";
import notepadRouter from "./routes/notepad.js";
import portfolioRouter from "./routes/portfolio.js";
import walletRouter from "./routes/wallet.js";
import zoomRouter from "./routes/zoom.js";
import gigsRouter from "./routes/gigs.js";
import ordersRouter from "./routes/orders.js";
import messagesRouter from "./routes/messages.js";
import categoryRouter from "./routes/category.js";
import clientRouter from "./routes/clients.js";
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
    origin: [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001", "https://do-task-swagger-ui.vercel.app", "https://dotask-service-marketplace-git-dev-wajihulhassan944s-projects.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);
// Using routes
app.use("/api/users", userRouter);
app.use("/api/category", categoryRouter);
app.use("/api/gigs", gigsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/zoom", zoomRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/notes", notepadRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/email", emailRouter);
app.use("/api/clients", clientRouter);

app.get("/", (req, res) => {
  res.send("Nice working backend by Muhammad Furqan Wajih");
});

// Using Error Middleware
app.use(errorMiddleware);
