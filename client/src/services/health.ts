import axios from 'axios'

const baseUrl = "/api/health-data"

const getMetriportData = async (metriportId: string) => {
    const response = await axios.get(`${baseUrl}/${metriportId}`)
    return response.data
}

export default { getMetriportData }