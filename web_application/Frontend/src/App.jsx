import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { Upload, Search, Session, Login } from "./components";
import BrightnessHighIcon from '@mui/icons-material/BrightnessHigh';

function App() {
  return (
    <Router>
      <AppBar position="static">
        <Toolbar>
          <BrightnessHighIcon sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }} />
          <Typography variant="h6" style={{ flexGrow: 1 }}>
            Collabrative Web Application
          </Typography>
          <Button color="inherit" component={RouterLink} to="/">
            Login
          </Button>
          <Button color="inherit" component={RouterLink} to="/Upload">
            Upload
          </Button>
          <Button color="inherit" component={RouterLink} to="/search">
            Search
          </Button>
          <Button color="inherit" component={RouterLink} to="/session">
            Session
          </Button>
        </Toolbar>
      </AppBar>
      <Routes>
        <Route index element={<Login />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/search" element={<Search />} />
        <Route path="/session" element={<Session />} />
      </Routes>
    </Router>
  );
}

export default App;
