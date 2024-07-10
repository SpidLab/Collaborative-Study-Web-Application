import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppBar, Toolbar, Typography } from "@mui/material";
import { Home, Upload, Search, Session, NewUser, Login } from "./components";
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh';
import LoggedIn from './components/Navigation/LoggedIn';
import LoggedOut from './components/Navigation/LoggedOut';
import ForgotUsername from './components/Forgot/ForgotUsername'; 
import ForgotPassword from './components/Forgot/ForgotPassword'; 
import CollaborationsPage from './components/Collabrations/CollabrationsPage';
import CollaborationDetailsPage from './components/Collabrations/Details';
import SessionsResults from "./components/Session/SessionsResults";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token); 
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('token');
    return <Navigate to="/login" />;
  };

  let logoutTimer;
    const logoutTime = 10 * 60 * 1000;

    const logout = useCallback(() => {
      const token = localStorage.getItem('token');
      if (token) {
          alert("You have been logged out due to inactivity.");
          localStorage.removeItem('token'); 
          window.location.href = '/login'; 
      }
  }, []);

  const resetLogoutTimer = useCallback(() => {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(logout, logoutTime);
  }, [logout]);

    useEffect(() => {
        const events = ['mousemove', 'keydown', 'click', 'scroll'];

        const resetTimer = () => resetLogoutTimer();

        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        resetLogoutTimer();

  
        return () => {
            // Cleanup event listeners and timer on component unmount
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
            clearTimeout(logoutTimer);
        };
    }, [resetLogoutTimer]);
  
  return (
    <Router>
      <AppBar position="static">
        <Toolbar>
          <BrightnessHighIcon sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }} />
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Collaborative Web Application
          </Typography>
          {isLoggedIn ? (
            <LoggedIn onLogout={handleLogout} />
          ) : (
            <LoggedOut />
          )}
        </Toolbar>
      </AppBar>

      <Routes>
        <Route path="/" element={isLoggedIn ? <Home /> : <Navigate to="/login" />} />
        <Route path="/register" element={<NewUser />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/upload" element={isLoggedIn ? <Upload /> : <Navigate to="/login" />} />
        <Route path="/search" element={isLoggedIn ? <Search /> : <Navigate to="/login" />} />
        <Route path="/session" element={isLoggedIn ? <Session /> : <Navigate to="/login" />} />
        <Route path="/session/viewresults" element={ <SessionsResults />} />
        <Route path="/collaboration" element={isLoggedIn ? <CollaborationsPage /> : <Navigate to="/login" />} />
        <Route path="/collaboration/:id" element={isLoggedIn ? <CollaborationDetailsPage /> : <Navigate to="/login" />} />
        <Route path="/forgot/username" element={<ForgotUsername />} />
        <Route path="/forgot/password" element={<ForgotPassword />} />
      </Routes>
    </Router>
  );
}

export default App;
