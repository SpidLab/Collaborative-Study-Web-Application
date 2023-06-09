import express from 'express'
// import axios from 'axios'
import config from '../utils/config'
import { initializeHatClient } from '../utils/config'

// const PDA_URL_EXT = config.PDA_URL_EXT
const appConfig = config.appConfig
const pdaRouter = express.Router()

pdaRouter.get('/getData/:pdaUsername/:pdaToken', async (req, res) => {
    const token = req.params.pdaToken
    const pdaUsername = req.params.pdaUsername
    const hat = initializeHatClient(token, pdaUsername)
    console.log("PDA ACCESS TOKEN =======================")
    console.log(token)
    console.log("PDA USERNAME =======================")
    console.log(pdaUsername)
    try {
        const pdaData = await hat.hatData().getAllDefault(appConfig.namespace, "test")
        return res.status(200).send({ data: pdaData })
    } catch (error) {
        return res.status(400).send({ error: "Unable to get Dataswift PDA data." })
    }
})

pdaRouter.post('/postData/:pdaUsername', async (req, res) => {
    const body = req.body
    const pdaUsername = req.params.pdaUsername
    const hat = initializeHatClient(body.pdaToken, pdaUsername)
    try {
        const pdaData = await hat.hatData().create(appConfig.namespace, "test", body.healthData)
        return res.status(200).send({ data: pdaData })
    } catch (error) {
        return res.status(400).send({ error: "Unable to push data to PDA." })
    }
})

// const getPDAData = async (pdaToken, pdaUsername) => {
//     const config = {
//         headers: {
//             "Content-Type": "application/json",
//             "x-auth-token": pdaToken
//         }
//     }
//     const response = await axios.get(`http://${pdaUsername}.${PDA_URL_EXT}`, config)
//     // console.log(response.data)
//     return response.data
// }

// const pushDataToPDA = async (data, pdaUsername, pdaToken) => {
//     const config = {
//         headers: {
//             "Content-Type": "application/json",
//             "x-auth-token": pdaToken
//         }
//     }
//     const response = await axios.post(`http://${pdaUsername}.${PDA_URL_EXT}`, data, config)
//     // console.log(response.data)
//     return response.data
// }

export default pdaRouter