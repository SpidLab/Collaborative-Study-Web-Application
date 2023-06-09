import React from 'react'
import './App.css'
import { useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'
import Login from './components/Login'
import ProgressiveRegistration from './components/ProgressiveRegistration'
import Home from './pages/Home'
import { useStateValue } from './state/state'
import Notification from './components/Notification'
import AuthenticationHandler from './components/AuthenticationHandler'
import PDALogin from './components/PDALogin'

const App = () => {
  const [state, ] = useStateValue()

  console.log(state)

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Notification />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/pdalogin" element={<PDALogin />} />
        <Route path="/register" element={<ProgressiveRegistration />} />
        <Route path="/home" element={<Home />} />
        <Route path="/authentication" element={<AuthenticationHandler />} />
      </Routes>
    </Box>
  )
}

export default App