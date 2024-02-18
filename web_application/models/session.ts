import mongoose from "mongoose"

const sessionSchema = new mongoose.Schema({
    sessionID: {
        type: String,
        required: true,
        minLength: 1
    },
    userID: {
        type: String,
        required: true,
        minLength: 1
    },
    groupChatID: {
        type: String,
        required: true,
        minLength: 1
    },
    metadataID: {
        type: String,
        required: true,
        minLength: 1
    }
})

sessionSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const Session = mongoose.model('Session', sessionSchema)

export default Session