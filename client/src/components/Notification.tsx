import React from 'react'
import MuiAlert, { AlertProps } from '@mui/material/Alert'
import { Snackbar } from '@mui/material'
import { useStateValue } from '../state/state'

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(props, ref) {
    return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />
})

const Notification = () => {
    const [state, dispatch] = useStateValue()
    const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return
        }

        dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: '', alertType: 'none' } })
    }

    return (
        <Snackbar open={state.notification.alertType !== 'none'} autoHideDuration={3000} onClose={handleClose}>
            <Alert onClose={handleClose} severity={state.notification.alertType === "success" ? "success" : "error"} sx={{ width: '100%' }}>
                {state.notification.message}
            </Alert>
        </Snackbar>
    )
}

export default Notification