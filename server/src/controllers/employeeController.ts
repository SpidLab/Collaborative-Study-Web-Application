import express from 'express'
import Employee from '../models/employee'

const employeeRouter = express.Router()

employeeRouter.put('/updatePDAToken', async (req, res) => {
    const { progressiveEmployeeId, pdaToken } = req.body
    const employee = await Employee.findOne({ progressiveEmployeeId })
    if (!employee) {
        return res.status(404).json({
            error: `Employee ${progressiveEmployeeId} does not exist.`
        })
    }
    if (pdaToken !== employee.pdaOwnerToken) {
        const updatedEmployee = await Employee.findOneAndUpdate({ progressiveEmployeeId }, { $set: { pdaOwnerToken: pdaToken } }, { new: true })
        return res.status(200).send({ updatedEmployee })
    }
    return res.status(200).send(employee)
})

employeeRouter.put('/updatePDAUsername', async (req, res) => {
    const { progressiveEmployeeId, pdaUsername } = req.body
    const employee = await Employee.findOne({ progressiveEmployeeId })
    if (!employee) {
        return res.status(404).json({
            error: `Employee ${progressiveEmployeeId} does not exist.`
        })
    }
    if (pdaUsername !== employee.pdaUsername) {
        const updatedEmployee = await Employee.findOneAndUpdate({ progressiveEmployeeId }, { $set: { pdaUsername: pdaUsername } }, { new: true })
        return res.status(200).send({ updatedEmployee })
    }
    return res.status(200).send(employee)
})

// TODO - store service provider id in DB, and use this route to return that
// employeeRouter.get('/service-provider-id', async (req, res) => {
    
// })

export default employeeRouter