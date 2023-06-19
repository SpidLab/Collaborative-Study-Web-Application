import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
    userID: {
        type: String,
        required: true,
        minLength: 1
    },
    name: {
        type: String,
        required: true,
        minLength: 1
    },
    email: {
        type: String,
        required: true,
        minLength: 1
    },
    passwordHash: String,
})

userSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const User = mongoose.model('User', userSchema)

export default User