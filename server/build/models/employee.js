"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const employeeSchema = new mongoose_1.default.Schema({
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
    metriportId: String
});
employeeSchema.set('toJSON', {
    transform: (_document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
        return returnedObject;
    }
});
const Employee = mongoose_1.default.model('Employee', employeeSchema);
exports.default = Employee;
