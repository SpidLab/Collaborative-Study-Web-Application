import React from 'react'
import { Button } from '@mui/material'
import { User } from '../types'
import LogoutIcon from '@mui/icons-material/Logout'
import { useStateValue } from '../state/state'
import { useNavigate } from 'react-router-dom'

const Logout = () => {
    const [, dispatch] = useStateValue()
    const navigate = useNavigate()

    const handleLogout = () => {
        window.sessionStorage.clear()
        dispatch({ type: "SET_USER", payload: {} as User })
        // dispatch({ type: "SET_PDA_TOKEN", payload: '' })
        // dispatch({ type: "SET_PDA_USERNAME", payload: '' })
        dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: "Logged out successfully.", alertType: 'success' } })
        navigate('/')
    }

    return (
        <Button
            variant="contained"
            sx={{
                alignContent: "center",
                textTransform: 'none',
                maxWidth: "100px",
                minWidth: 0,
                alignSelf: "flex-end",
                position: "absolute",
                top: 0,
                right: 0,
                marginTop: 2,
                marginRight: 2
            }}
            onClick={handleLogout}
            endIcon={<LogoutIcon />}>
            Logout
        </Button>
    )
}

export default Logout