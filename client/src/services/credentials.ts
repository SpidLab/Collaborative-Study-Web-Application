import axios from 'axios'
import { NewUser } from '../types'
const baseUrl = '/api/credentials'

type Credentials = {
    progressiveEmployeeId: string,
    password: string
}

const createUser = async (newUser: NewUser) => {
    const response = await axios.post(`${baseUrl}/register`, newUser)
    return response.data
}

const login = async (credentials: Credentials) => {
    const response = await axios.post(`${baseUrl}/auth`, credentials)
    return response.data
}

export default { login, createUser }