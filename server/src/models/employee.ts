import mongoose from "mongoose"

const employeeSchema = new mongoose.Schema({
    progressiveEmployeeId: {
        type: String,
        required: true,
        minLength: 1
    },
    name: {
        type: String,
        required: true,
        minLength: 1
    },
    passwordHash: String,
    metriportId: String,
    pdaOwnerToken: String,
    pdaUsername: String
})

employeeSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString()
        delete returnedObject._id
        delete returnedObject.__v
        return returnedObject
    }
})

const Employee = mongoose.model('Employee', employeeSchema)

export default Employee