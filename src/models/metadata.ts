import mongoose from "mongoose"

const metadataSchema = new mongoose.Schema({
    metadataID: {
        type: String,
        required: true,
        minLength: 1
    },
    userID: {
        type: String,
        required: true,
        minLength: 1
    },
    sessionID: {
        type: String,
        required: true,
        minLength: 1
    },
    //the .csv metadata file will be parsed and stored as entries in the database
    mi: {
        type: String,
        required: true,
        minLength: 1
    }
})

metadataSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const Metadata = mongoose.model('Metadata', metadataSchema)

export default Metadata