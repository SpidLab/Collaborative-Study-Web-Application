import React from 'react'
import { Button } from '@mui/material'
import { useStateValue } from '../state/state'
import { AxiosError } from 'axios'
import healthService from '../services/health'
import pdaService from '../services/pda'

const PushDataButton = () => {
    const [state, dispatch] = useStateValue()

    const handleClick = async (event: any) => {
        event.preventDefault()
        try {
            if (state.user.metriportId && state.user.pdaUsername && state.user.pdaOwnerToken) {
                const healthData = await healthService.getMetriportData(state.user.metriportId)
                console.log(healthData)
                const pdaData = await pdaService.pushDataToPDA(healthData, state.user.pdaUsername, state.user.pdaOwnerToken)
                // console.log(pdaData)
                dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: "Data successfully shared!", alertType: 'success' } })
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

    return (
        <Button
            sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}
            variant="contained"
            onClick={handleClick}>
                Share health data with Progressive
        </Button>
    )
}

export default PushDataButton