import React from 'react'
import { Button } from '@mui/material'
import { useStateValue } from '../state/state'

const ConnectWidget = () => {
    const [state,] = useStateValue()

    return (
        <Button
            sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}
            variant="contained"
            onClick={() => window.open(`https://connect.metriport.com/?token=${state.user.metriportToken}`)}>
            Connect to health data sources
        </Button>
    )
}

export default ConnectWidget