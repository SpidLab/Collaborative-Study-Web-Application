import React, { useEffect } from 'react'
import { Box, Stack } from '@mui/system'
import ConnectWidget from '../components/ConnectWidget'
import Logout from '../components/Logout'
import PushDataButton from '../components/PushDataButton'
import { useStateValue } from '../state/state'
import { useNavigate } from 'react-router-dom'
import setToken from '../services/token'
import employeeService from '../services/employee'
import { User } from '../types'

const Home = () => {
    const [state, dispatch] = useStateValue()
    const navigate = useNavigate()

    useEffect(() => {
        const pdaUsernameCache = window.sessionStorage.getItem('pdaUsername')
        const pdaOwnerTokenCache = window.sessionStorage.getItem('pdaOwnerToken')
        const metriportInfoCache = window.sessionStorage.getItem('metriportInfo')
        const progressiveEmployeeIdCache = window.sessionStorage.getItem('progressiveEmployeeId')
        if (pdaUsernameCache && pdaOwnerTokenCache && metriportInfoCache && progressiveEmployeeIdCache) {
            const metriportInfo = JSON.parse(metriportInfoCache)
            const user: User = {
                progressiveEmployeeId: progressiveEmployeeIdCache,
                pdaUsername: pdaUsernameCache,
                pdaOwnerToken: pdaOwnerTokenCache,
                metriportId: metriportInfo.metriportId,
                metriportToken: metriportInfo.metriportToken
            }
            employeeService.updatePDAUsername(progressiveEmployeeIdCache, pdaUsernameCache).then((data) => {
                employeeService.updatePDAToken(progressiveEmployeeIdCache, pdaOwnerTokenCache).then((data2) => {
                    dispatch({ type: "SET_USER", payload: user })
                })
            })
        } else {
            window.sessionStorage.clear()
            navigate("/")
        }
    }, [state.user.pdaUsername, state.user.pdaOwnerToken, dispatch, navigate])

    return (
        <Box display={"flex"} justifyContent={"center"} alignItems={"center"} minHeight={"100vh"}>
            <Logout />
            <Stack direction={"row"} spacing={8} justifyContent={"center"} alignItems={"center"}>
                <ConnectWidget />
                <PushDataButton />
            </Stack>
        </Box>
    )
}

export default Home