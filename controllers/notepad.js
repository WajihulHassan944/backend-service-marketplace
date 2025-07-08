import { Notepad } from "../models/notepad.js";
import { Notification } from "../models/notification.js";

export const createNote = async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.user._id; // assumes auth middleware adds req.user

    const note = await Notepad.create({
      userId,
      title,
      description,
      date: new Date(),       // default to current date
      isImportant: false,     // default
      status: "pending",      // default
    });

    await Notification.create({
      user: userId,
      title: "New Note Created",
      description: `Your note titled "${title}" was successfully created.`,
      type: "note",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad", // add a link to notes page if you have one
    });

 await Notification.create({
      user: "6836a8ab3503274446274b32",
      title: "New Note Created",
      description: `Note titled "${title}" was successfully created.`,
      type: "note",
      targetRole: "superadmin",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad", // add a link to notes page if you have one
    });

    return res.status(201).json({ success: true, note });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

export const getNoteById = async (req, res) => {
  try {
    const { id } = req.params;

    const note = await Notepad.findById(id);

    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    return res.status(200).json({ success: true, note });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Get all notes (admin/debug use)
export const getAllNotes = async (req, res) => {
  try {
    const notes = await Notepad.find().populate("userId", "firstName lastName email");
    return res.json({ success: true, notes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Get notes by logged-in user
export const getNotesByUserId = async (req, res) => {
  try {
    const userId = req.user._id;
    const notes = await Notepad.find({ userId }).sort({ createdAt: -1 });
    return res.json({ success: true, notes });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Update a note
export const updateNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const updated = await Notepad.findOneAndUpdate(
      { _id: id, userId }, // ensure user owns the note
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: "Note not found or unauthorized" });
    }


     await Notification.create({
      user: userId,
      title: "Note Updated",
      description: `Your note titled "${updated.title}" was updated.`,
      type: "note",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad",
    });

    return res.json({ success: true, note: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Delete a note
export const deleteNote = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const deleted = await Notepad.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Note not found or unauthorized" });
    }

    await Notification.create({
      user: userId,
      title: "Note Deleted",
      description: `Your note titled "${deleted.title}" was deleted.`,
      type: "note",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad",
    });


    return res.json({ success: true, message: "Note deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};


// Toggle important flag
export const toggleImportant = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const note = await Notepad.findOne({ _id: id, userId });
    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found or unauthorized" });
    }

    note.isImportant = !note.isImportant;
    await note.save();

await Notification.create({
      user: userId,
      title: note.isImportant ? "Marked as Important" : "Unmarked as Important",
      description: `Note "${note.title}" was ${note.isImportant ? "marked" : "unmarked"} as important.`,
      type: "note",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad",
    });



    return res.json({ success: true, note });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Change note status (pending <-> completed)
export const changeNoteStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (!["pending", "completed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const note = await Notepad.findOneAndUpdate(
      { _id: id, userId },
      { status, updatedAt: Date.now() },
      { new: true }
    );

    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found or unauthorized" });
    }

     await Notification.create({
      user: userId,
      title: "Note Status Updated",
      description: `Note "${note.title}" is now marked as ${status}.`,
      type: "note",
      targetRole: "seller",
      link: "http://dotask-service-marketplace.vercel.app/seller/notepad",
    });

    return res.json({ success: true, note });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
