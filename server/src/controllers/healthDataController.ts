import express from 'express'
import config from '../utils/config'

const metriportClient = config.METRIPORT_CLIENT
const healthDataRouter = express.Router()

healthDataRouter.get('/:metriportId', async (req, res) => {
    try {
        const id = req.params.metriportId
        if (!id) {
            res.status(404).send({ error: "Metriport ID not found. Please try again." })
        }
        // UTC timezone
        const date = new Date().toLocaleDateString("en-CA") // yyyy-mm-dd (e.g. 2023-02-23)
        // const date = "2023-03-21" // manual date    

        const activityData = await metriportClient.getActivityData(id, date)
        // console.log(activityData)
        const biometricsData = await metriportClient.getBiometricsData(id, date)
        // console.log(biometricsData)
        const bodyData = await metriportClient.getBodyData(id, date)
        // console.log(bodyData)
        const nutritionData = await metriportClient.getNutritionData(id, date)
        // console.log(nutritionData)
        const sleepData = await metriportClient.getSleepData(id, date)
        // console.log(sleepData)

        const data = {
            activityData: { ...activityData },
            biometricsData: { ...biometricsData },
            bodyData: { ...bodyData },
            nutritionData: { ...nutritionData },
            sleepData: { ...sleepData }
        }
        return res.status(200).send(data)
    } catch (error) {
        return res.status(400).send({ error: "Unable to share health data." })
    }
})

export default healthDataRouter