import express from "express";
import {
  createNote,
  getAllNotes,
  getNotesByUserId,
  updateNote,
  deleteNote,
  toggleImportant,
  changeNoteStatus,
  getNoteById,
} from "../controllers/notepad.js";
import { isAuthenticated} from "../middlewares/auth.js";


const router = express.Router();

router.post("/create", isAuthenticated, createNote);
router.get("/all", getAllNotes); // Optional: for admin/debug
router.get("/user", isAuthenticated, getNotesByUserId);
router.put("/:id", isAuthenticated, updateNote);
router.delete("/:id", isAuthenticated, deleteNote);
router.patch("/toggle-important/:id", isAuthenticated, toggleImportant);
router.patch("/status/:id", isAuthenticated, changeNoteStatus);
router.get('/:id', getNoteById);
export default router;
