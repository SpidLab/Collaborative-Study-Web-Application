import axios from 'axios'

const baseUrl = '/api/pda'

// // TODO: parameterized username inside urls
// const getAccessToken = async (pda_username: string) => {
//     const config = {
//         headers: {
//             Accept: "application/json",
//             username: pda_username,
//             password: "burger-wine-cheese"
//         }
//     }
//     const response = await axios.get(`https://${pda_username}.hubat.net/users/access_token`, config)
//     return response.data
// }

const getPDAData = async (pda_username: string, pdaToken: string) => {
    const response = await axios.get(`${baseUrl}/getData/${pda_username}/${pdaToken}`)
    return response.data
}

const pushDataToPDA = async (data: any, pda_username: string, pdaToken: string) => {
    const pda = { healthData: data, pdaToken: pdaToken }
    const response = await axios.post(`${baseUrl}/postData/${pda_username}`, pda)
    return response.data
}

export default {
    // getAccessToken,
    getPDAData,
    pushDataToPDA
}