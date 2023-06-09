import bcrypt from 'bcrypt'
import express from 'express'
import Employee from '../models/employee'
import config from '../utils/config'

const metriportClient = config.METRIPORT_CLIENT
const credentialsRouter = express.Router()

credentialsRouter.post('/auth', async (req, res) => {
    const { progressiveEmployeeId, password } = req.body
    const employee = await Employee.findOne({ progressiveEmployeeId })

    if (!employee) {
        return res.status(404).json({
            error: `Employee ${progressiveEmployeeId} does not exist.`
        })
    }

    if (!employee.passwordHash) {
        return res.status(401).json({
            error: 'Something went wrong.'
        })
    }
    const passwordCorrect = employee === null
        ? false
        : await bcrypt.compare(password, employee.passwordHash) // await is necessary

    if (!passwordCorrect) {
        return res.status(401).json({
            error: 'Incorrect password.'
        })
    }
    const metriportId = employee.metriportId
    if (!metriportId) {
        return res.status(404).json({ error: "Metriport Id not created." })
    }
    const token = await metriportClient.getConnectToken(metriportId)
    return res.status(200).send({
        progressiveEmployeeId: progressiveEmployeeId,
        metriportId: metriportId,
        metriportToken: token,
        pdaOwnerToken: employee.pdaOwnerToken,
        pdaUsername: employee.pdaUsername
    })
})

credentialsRouter.post('/register', async (req, res) => {
    const { progressiveEmployeeId, name, password } = req.body
    if (progressiveEmployeeId.length < 1 || password.length < 1) {
        return res.status(400).json({
            error: 'Employee ID and password must be at least 1 character long.'
        })
    }

    const existingEmployee = await Employee.findOne({ progressiveEmployeeId })
    if (existingEmployee) {
        return res.status(400).json({
            error: `Account already created for employee ${progressiveEmployeeId}.`
        })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    // const metriportId = await metriportClient.getMetriportUserId(progressiveEmployeeId)
    const metriportId = "69b23ecd-f909-4f27-b9f3-ef8570013532"
    const employee = new Employee({
        progressiveEmployeeId,
        name,
        passwordHash,
        metriportId,
        pdaOwnerToken: "",
        pdaUsername: ""
    })
    const savedEmployee = await employee.save()
    return res.status(201).json(savedEmployee)
})

export default credentialsRouter