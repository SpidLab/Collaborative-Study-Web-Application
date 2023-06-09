import express from 'express'
import config from '../utils/config'
import axios from 'axios'

const userAgentRouter = express.Router()

userAgentRouter.post('/create-service-provider', async (req, res) => {
    try {
        const service_provider_id = req.body.service_provider_id // store service_provider_id in DB instead perhaps
        const CREATE_INVITATION_BODY = {
            "accept": [
                "didcomm/aip1",
                "didcomm/aip2;env=rfc19"
            ],
            "alias": "Barry",
            "handshake_protocols": [
                "did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/didexchange/1.0"
            ],
            "metadata": {},
            "my_label": "Invitation to Barry",
            "protocol_version": "1.1",
            "use_public_did": false
        }
        const create_inv_res = await axios.post(
            `${config.SERVICE_PROVIDER_AGENT_BASE_URL}/out-of-band/create-invitation`,
            CREATE_INVITATION_BODY)
        const invitation_response_body = create_inv_res.data.invitation
        const service_provider_post_res = await axios.post(`${config.USER_AGENT_CONTROLLER_BASE_URL}/service-providers/${service_provider_id}`, invitation_response_body)
        return res.sendStatus(service_provider_post_res.status)
    } catch (error) {
        return res.status(500).send({ error: "Something went wrong." })
    }
})

userAgentRouter.put('/set-access-control', async (req, res) => {
    try {
        const service_provider_id = req.body.service_provider_id // perhaps get from DB
        const access_control = req.body.access_control
        const service_provider_access_control_res = await axios.put(`${config.USER_AGENT_CONTROLLER_BASE_URL}/access/${service_provider_id}`, access_control)
        return res.sendStatus(service_provider_access_control_res.status)
    } catch (error) {
        return res.status(500).send({ error: "Something went wrong." })
    }
})

userAgentRouter.delete('/delete-service-provider', async (req, res) => {
    try {
        const service_provider_id = req.body.service_provider_id // perhaps get from DB
        const response = await axios.delete(`${config.USER_AGENT_CONTROLLER_BASE_URL}/service-providers/${service_provider_id}`)
        return res.sendStatus(response.status)
    } catch (error) {
        return res.status(500).send({ error: "Something went wrong." })
    }
})

userAgentRouter.post('/push-health-data', async (req, res) => {
    try {
        const healthData = req.body
        const formattedHealthData = {
            "heartbeat-data": healthData.biometricsData[0].heart_rate
        }
        const response = await axios.post(`${config.USER_AGENT_CONTROLLER_BASE_URL}/push-new-data`, formattedHealthData)
        return res.status(200).send(response.data)
    } catch (error) {
        return res.status(500).send({ error: "Something went wrong." })
    }
})

export default userAgentRouter