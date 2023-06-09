import axios from 'axios'
const baseUrl = '/api/employee'

const updatePDAToken = async (progressiveEmployeeId: string, pdaToken: string) => {
    const data = {
        progressiveEmployeeId,
        pdaToken
    }
    const response = await axios.put(`${baseUrl}/updatePDAToken`, data)
    return response.data
}

const updatePDAUsername = async (progressiveEmployeeId: string, pdaUsername: string) => {
    const data = {
        progressiveEmployeeId,
        pdaUsername
    }
    const response = await axios.put(`${baseUrl}/updatePDAUsername`, data)
    return response.data
}

export default { updatePDAToken, updatePDAUsername }