import React, { useState, useEffect } from 'react'
import { HatClient } from '@dataswift/hat-js'
import { isHatName } from '../utils/validation'
import { appConfig } from '../utils/dataswift.config'
import { useStateValue } from '../state/state'
import { AxiosError } from 'axios'
import { Box, Button, FormControl, TextField } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { User } from '../types'

/**
 * PDALogin
 *
 * This is the login page for PDAs, it is accessible at the '/pdalogin' route.
 */

const PDALogin = () => {
    const [username, setUsername] = useState('')
    const [, dispatch] = useStateValue()
    const navigate = useNavigate()

    const errorMessages = {
        usernameNotValid: 'Username is not valid. Try without the domain',
        usernameNotRecognised: 'Username is not recognised. Try without the domain',
    }

    useEffect(() => {
        if (!window.sessionStorage.getItem('metriportInfo')) {
            navigate("/")
        }
    }, [navigate])

    useEffect(() => {
        const hat = new HatClient({})
        const pdaUsernameCache = window.sessionStorage.getItem('pdaUsername')
        const pdaOwnerTokenCache = window.sessionStorage.getItem('pdaOwnerToken')
        const metriportInfoCache = window.sessionStorage.getItem('metriportInfo')
        const progressiveEmployeeIdCache = window.sessionStorage.getItem('progressiveEmployeeId')
        // console.log(pdaUsernameCache)
        // console.log(pdaOwnerTokenCache)
        // console.log(metriportInfoCache)
        // console.log(progressiveEmployeeIdCache)
        if (pdaUsernameCache && pdaOwnerTokenCache && !hat.auth().isTokenExpired(pdaOwnerTokenCache) && metriportInfoCache && progressiveEmployeeIdCache) {
            console.log("PDA Token expired: " + hat.auth().isTokenExpired(pdaOwnerTokenCache))
            const metriportInfo = JSON.parse(metriportInfoCache)
            const user: User = {
                progressiveEmployeeId: progressiveEmployeeIdCache,
                pdaUsername: pdaUsernameCache,
                pdaOwnerToken: pdaOwnerTokenCache,
                metriportId: metriportInfo.metriportId,
                metriportToken: metriportInfo.metriportToken
            }
            dispatch({ type: "SET_USER", payload: user })
            navigate("/home")
        }
    }, [dispatch, navigate])


    const redirectValidUser = async (username: string) => {
        try {
            const hat = new HatClient({})
            const hatDomain = username + appConfig.hatCluster

            const res = await hat.auth().isDomainRegistered(hatDomain)

            if (res) {
                const hatUrl = `https://${hatDomain}`
                const redirectUrl = `http://${window.location.host}/authentication`
                const fallback = `http://${window.location.host}/authentication`
                const applicationId = appConfig.applicationId
                window.sessionStorage.setItem('pdaUsername', username)
                dispatch({ type: "SET_PDA_USERNAME", payload: username })
                window.location.href = hat.auth().generateHatLoginUrl(hatUrl, applicationId, redirectUrl, fallback)
            } else {
                dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: errorMessages.usernameNotRecognised, alertType: 'error' } })
            }
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

    const handleChange = (event: any) => {
        setUsername(event.target.value)
    }

    const handleSubmit = (event: any) => {
        event.preventDefault()
        validateLoginDetails()
    }

    const handleGoBack = (event: any) => {
        event.preventDefault()
        navigate("/")
        window.sessionStorage.clear()
        dispatch({ type: "SET_USER", payload: {} as User })
        // dispatch({ type: "SET_PDA_USERNAME", payload: '' })
    }

    const validateLoginDetails = () => {
        if (isHatName(username)) {
            redirectValidUser(username)
        } else {
            dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: errorMessages.usernameNotValid, alertType: 'error' } })
        }
    }

    return (
        <Box display={"flex"} justifyContent={"center"} alignItems={"center"} paddingTop={40}>
            <FormControl>
                <h3>Log in to Personal Data Account</h3>
                <TextField
                    name={'123456dev (.hubat.net)'}
                    type={'text'}
                    placeholder="123456dev (.hubat.net)"
                    autoComplete={'username'}
                    value={username}
                    onChange={e => handleChange(e)}
                />
                <Button variant={"contained"} onClick={handleSubmit} sx={{ my: 2 }}>Next</Button>
                <Button variant="text" onClick={handleGoBack}>Go back to Progressive login</Button>
            </FormControl>
        </Box>
    )
}

export default PDALogin
