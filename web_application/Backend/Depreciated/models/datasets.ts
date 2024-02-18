import mongoose from "mongoose"

const datasetSchema = new mongoose.Schema({
    datasetID: {
        type: String,
        required: true,
        minLength: 1
    },
    userID: {
        type: String,
        required: true,
        minLength: 1
    },
    phenotype: {
        type: String,
        required: true,
        minLength: 1
    },
    sampleSize: {
        type: String,
        required: true,
        minLength: 1
    },
    snpList: {
        type: String,
        required: true,
        minLength: 1,
        // Add a value of 0 or 1 for each SNP in the list
        value: {
            type: String,
            required: true,
            minLength: 1,
            maxLength: 1
        }
    }
})

datasetSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const Dataset = mongoose.model('Dataset', datasetSchema)

export default Dataset