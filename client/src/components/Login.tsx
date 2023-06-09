import React from 'react'
import { useState } from 'react'
import { Box, FormControl, TextField, Stack, Button } from '@mui/material'
import credentialsService from '../services/credentials'
import setToken from '../services/token'
import { User } from '../types'
import { AxiosError } from 'axios'
import { useStateValue } from '../state/state'
import { useNavigate } from 'react-router-dom'

const Login = () => {
    const [progressiveEmployeeId, setProgressiveEmployeeId] = useState('')
    const [password, setPassword] = useState('')
    const [, dispatch] = useStateValue()
    const navigate = useNavigate()

    const handleLogin = async (event: any) => {
        event.preventDefault()
        try {
            const user: User = await credentialsService.login({ progressiveEmployeeId, password })
            dispatch({ type: "SET_USER", payload: user })
            const metriportInfo = {
                metriportId: user.metriportId,
                metriportToken: user.metriportToken
            }
            window.sessionStorage.setItem('metriportInfo', JSON.stringify(metriportInfo))
            if (user.progressiveEmployeeId)
                window.sessionStorage.setItem('progressiveEmployeeId', user.progressiveEmployeeId)
            if (user.pdaUsername && user.pdaOwnerToken) {
                window.sessionStorage.setItem('pdaUsername', user.pdaUsername)
                window.sessionStorage.setItem('pdaOwnerToken', user.pdaOwnerToken)
            }
            navigate("/pdalogin")
        } catch (error: unknown) {
            let message = null
            console.log(error)
            if (error instanceof AxiosError) {
                message = error?.response?.data.error
            }
            if (message == null || message === '') {
                message = "Something went wrong."
            }
            dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: message, alertType: 'error' } })
        }
    }

    return (
        <Box display={"flex"} justifyContent={"center"} alignItems={"center"} paddingTop={24}>
            <FormControl sx={{ p: 2 }}>
                <h2>Log In</h2>
                <Stack spacing={2}>
                    <TextField
                        id="outlined-username"
                        label="Progressive Employee ID"
                        value={progressiveEmployeeId}
                        onChange={({ target }) => setProgressiveEmployeeId(target.value)}
                        required={true}
                    />
                    <TextField
                        id="outlined-password"
                        label="Password"
                        onChange={({ target }) => setPassword(target.value)}
                        required={true}
                        type="password"
                        autoComplete="current-password"
                    />
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" onClick={handleLogin}>
                            Login
                        </Button>
                        <Button variant="text" onClick={() => navigate("/register")}>
                            New? Register Here
                        </Button>
                    </Stack>
                </Stack>
            </FormControl>
        </Box>
    )
}

export default Login