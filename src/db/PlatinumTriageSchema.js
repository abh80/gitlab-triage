import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true
    },
    resourceType: {
        type: String,
        required: true
    },
    resourceIid: {
        type: Number,
        required: true
    },
    projectId: {
        type: String,
        required: true
    },
    noteId: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

export const TriageSchema = mongoose.model('platinum_triage_collection', commentSchema);