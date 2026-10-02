import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    history: [
        {
            role:{
            type: String,
            enum: ['user', 'model'],
            required: true
        },
        parts: [
            {
                text:{
                    type: String,
                    required: true,
                },
            },
        ],
        voiceTurnId: {
            type: String,
        },
        img: {
            type: String,
            required: false,
        },
        },
    ],
},
{timestamps: true}
);

export default mongoose.models.chat || mongoose.model("chat", chatSchema);