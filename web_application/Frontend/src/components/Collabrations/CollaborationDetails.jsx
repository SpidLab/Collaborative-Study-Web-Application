import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Typography, alpha, Divider, Button, Slider, TextField, Chip, Grid, Checkbox, Snackbar, Alert, CircularProgress, Container, Card, CardContent, List, ListItem, ListItemText, Tabs, Tab, Tooltip, TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Stepper, Step, StepContent, StepLabel, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { Add, Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon, DownloadRounded, RadioButtonUncheckedRounded } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';
import URL from '../../config';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import statSampleImage from "../../assets/Stat Sample.png";
import InfoIcon from '@mui/icons-material/Info';


const CollaborationDetails = () => {
  const { uuid } = useParams();
  const [collaboration, setCollaboration] = useState(null);
  const [collabName, setCollabName] = useState('');
  const [experimentName, setExperimentName] = useState('');
  const [experimentList, setExperimentList] = useState([]);
  const [phenoType, setPhenotype] = useState('');
  const [creator, setCreator] = useState('');
  // const [samples, setSamples] = useState('');
  const [file, setFile] = useState(null);
  const [role, setRole] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [senderInfo, setSenderInfo] = useState({ id: null, name: '' });
  const [invitedUsers, setInvitedUsers] = useState([]);
  const [collaborationUuid, setCollaborationUuid] = useState('');
  const [threshold, setThreshold] = useState(null);
  const [thresholdDefined, setThresholdDefined] = useState();
  const [newThreshold, setNewThreshold] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progressActiveStep, setProgressActiveStep] = useState(0);
  const [isQcInitiateLoading, setIsQcInitiateLoading] = useState(false);
  const [qcResultsAvailable, setQcResultsAvailable] = useState(false);
  const [qcResults, setQcResults] = useState(null);
  const [isQcResultsLoading, setIsQcResultsLoading] = useState(false);
  const [displayQcResults, setdisplayQcResults] = useState(false);
  const [qcInitiated, setQcInitiated] = useState(false); // New state to track QC initiation
  const [filteredResults, setFilteredResults] = useState([]);
  const [gwasResults, setGwasResults] = useState([]);
  const [gwasResultsAvailable, setGwasResultsAvailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevFilteredResultsRef = useRef();
  // const [matrix, setMatrix] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [originalCollabName, setOriginalCollabName] = useState('');
  const [originalExperimentList, setOriginalExperimentList] = useState([]);
  const [originalPhenoType, setOriginalPhenoType] = useState('');
  const [originalSamples, setOriginalSamples] = useState('');
  const [selectedTab, setSelectedTab] = useState(0); // for GWAS results

  const determineUserRole = (data) => {
    if (data.is_sender) {
      setRole('sender');
    } else {
      setRole('receiver');
    }
  };
  const steps = ['QC Calculation', 'Stat Data Upload'];


  useEffect(() => {
    const fetchCollaborationDetails = async () => {
      try {
        const response = await axios.get(`${URL}/api/collaboration/${uuid}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        // console.log(response.data);
        setCollaboration(response.data);
        setCollabName(response.data.name);
        setExperimentList(response.data.experiments || []);
        setPhenotype(response.data.creator_datasets.phenotype || []);
        setCreator(response.data.creator_datasets || []);
        // setSamples(response.data.creator_datasets.samples || '');
        setCollaborationUuid(response.data.uuid);
        setSenderInfo({ is_sender: response.data.is_sender, name: response.data.sender_name, id: response.data.sender_id });
        setInvitedUsers(response.data.invited_users || []);
        determineUserRole(response.data);
      } catch (error) {
        console.error('Error fetching collaboration details:', error);
        setSnackbar({
          open: true,
          message: 'Failed to fetch collaboration details. Please try again.',
          severity: 'error',
        });
      }
    };
    fetchCollaborationDetails();
  }, [uuid]);


  console.log('QC Data:', collaboration);

  const handleAddExperiment = () => {
    if (experimentName.trim()) {
      setExperimentList([...experimentList, experimentName.trim()]);
      setExperimentName('');
    } else {
      setSnackbar({ open: true, message: 'Experiment name cannot be empty.', severity: 'error' });
    }
  };

  const handleDeleteExperiment = (index) => {
    const updatedList = experimentList.filter((_, i) => i !== index);
    setExperimentList(updatedList);
  };
  // Stat upload handlers
  const handleFileUpload = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmitStat = async () => {
    if (!file) {
      setSnackbar({ open: true, message: "No File Selected.", severity: 'error' });
      return;
    }

    const collabStatData = new FormData();
    collabStatData.append('file', file);
    collabStatData.append('uuid', uuid);

    try {
      //waiting for the endpoint to be created
      const response = await axios.post(`${URL}/api/upload_csv_stats`, collabStatData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.status === 200) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }

      setSnackbar({
        open: true,
        message: 'Stat data uploaded Successfully!',
        severity: 'success'
      });

      setFile('');

    } catch (error) {
      console.error('Error uploading file:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload Stat data, please try again.',
        severity: 'error'
      });
    }
  };
  //Updates DB with the user's dataset file
  const handleQcUpload = async () => {
    if (!file) {
      setSnackbar({ open: true, message: "No File Selected.", severity: 'error' });
      return;
    }

    const qcData = new FormData();
    qcData.append('file', file);
    qcData.append('dataset_id', collaboration.invited_users[0].user_dataset_id);

    try {
      //waiting for the endpoint to be created
      const response = await axios.post(`${URL}/api/update_qc_data`, qcData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      setTimeout(() => {
        window.location.reload(); // reloads the page after 2 seconds
      }, 1000);

      checkQcStatus();

      // console.log('File uploaded successfully:', response.data);
      setSnackbar({
        open: true,
        message: 'QC Data uploaded Successfully!',
        severity: 'success'
      });

      setFile('');

    } catch (error) {
      console.error('Error uploading file:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload QC Data, please try again.',
        severity: 'error'
      });
    }
  };


  // const handleUpdateCollaboration = async () => {
  //   setIsLoading(true);
  //   try {
  //     const updateData = {
  //       name: collabName,
  //       experiments: experimentList,
  //       phenotype: phenoType,
  //       samples: samples,
  //     };
  //     if (role === 'receiver') {
  //       updateData.stat_data = file ? file.name : null;
  //     }
  //     await axios.put(`${URL}/api/collaboration/${uuid}`, updateData, {
  //       headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  //     });
  //     setSnackbar({
  //       open: true,
  //       message: 'Collaboration updated successfully!',
  //       severity: 'success',
  //     });
  //     setIsEditing(false);
  //   } catch (error) {
  //     console.error('Error updating collaboration:', error);
  //     setSnackbar({
  //       open: true,
  //       message: 'Failed to update collaboration. Please try again.',
  //       severity: 'error',
  //     });
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const handleAccept = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/acceptinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) =>
          prevUsers.map((user) =>
            user.user_id === userId ? { ...user, status: 'accepted' } : user
          )
        );
        setSnackbar({ open: true, message: 'Invitation accepted successfully!', severity: 'success' });
        setTimeout(() => {
          window.location.reload();
        }, 100);

      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to accept invitation. Please try again.', severity: 'error' });
    }
  };

  const handleReject = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/rejectinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation rejected successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error rejecting invitation:', error);
      setSnackbar({ open: true, message: 'Failed to reject invitation. Please try again.', severity: 'error' });
    }
  };

  const handleWithdraw = async (userId) => {
    try {
      const response = await axios.post(
        `${URL}/api/withdrawinvitation`,
        {
          uuid: collaborationUuid,
          receiver_id: userId,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.status === 200) {
        setInvitedUsers((prevUsers) => prevUsers.filter((user) => user.user_id !== userId));
        setSnackbar({ open: true, message: 'Invitation withdrawn successfully!', severity: 'success' });
      }
    } catch (error) {
      console.error('Error withdrawing invitation:', error);
      setSnackbar({ open: true, message: 'Failed to withdraw invitation. Please try again.', severity: 'error' });
    }
  };


  // Send the threshold value to the backend
  const handleSubmitThreshold = async () => {
    try {
      const response = await axios.post(`${URL}/api/datasets/${uuid}/qc-results`, {
        threshold: newThreshold,
      },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      if (response.status === 200) {
        setThresholdDefined(false);
        setThreshold(newThreshold);
        setTimeout(() => {
          window.location.reload(); // reloads the page after 2 seconds
        }, 1000);
      }
      // setThresholdDefined(false);
      // setThreshold(newThreshold);

      setSnackbar({
        open: true,
        message: 'Threshold applied and QC results in process.',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error submitting threshold:', error);

      setSnackbar({
        open: true,
        message: 'Failed to apply threshold. Please try again.',
        severity: 'error',
      });
    }
  };


  const checkQcStatus = async () => {
    try {
      const response = await axios.get(`${URL}/api/datasets/${uuid}/qc-results`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      console.log("QC results", response);
      if (response.status === 200) {
        setQcResultsAvailable(true);
        setdisplayQcResults(true);
        setIsQcInitiateLoading(false);
        setQcResults(response.data.full_qc_results); // Store QC results
        // below condition ensures if the threshold already defined by user earlier, it shall be used when user interacts with the UI again.
        if (response.data.threshold !== null) {
          setThreshold(response.data.threshold);
          setNewThreshold(response.data.threshold);
          setThresholdDefined(true);
          console.log("is threshold value define", threshold);
        } else {
          setThresholdDefined(false)
        }

        return true;
      } else {
        // console.error(`Unexpected response status: ${response.status}`);
        setQcResultsAvailable(false);
        return false;
      }
    } catch (error) {
      // console.error('Error checking QC status:', error);
      setQcResultsAvailable(false); // Default to unavailable in case of error
      return false;
    }
  };
  // to optimise
  console.log("QC Loading", isQcInitiateLoading);

  const checkGwasStatus = async () => {
    try {
      // check the endpoints for GWAS Results
      const response = await axios.get(`${URL}/api/calculate_chi_square_results/${uuid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      console.log('GWAS Results:', response.data);
      if (response.status === 200) {
        setGwasResults(response.data.chi_square_results);
        setGwasResultsAvailable(true);
      } else {
        // console.error(`Unexpected response status: ${response.status}`);
        setGwasResultsAvailable(false);
        return false;
      }
    } catch (error) {
      // console.error('Error checking QC status:', error);
      setGwasResultsAvailable(false); // Default to unavailable in case of error
      return false;
    }
  };
  // console.log("Gwas Available", gwasResultsAvailable);


  const handleGwasInitiate = async () => {
    try {
      const resultsAvailable = await checkGwasStatus();

      if (resultsAvailable) {
        setSnackbar({
          open: true,
          message: 'GWAS calculations are already completed.',
          severity: 'info',
        });
        return; // Exit early if results are available
      }

      // Proceed with GWAS initiation if no results are available
      const response = await axios.post(
        `${URL}/api/calculate_chi_square`,
        { uuid: uuid },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          }
        }
      );
      console.log('GWAS Results:', response);
      setSnackbar({
        open: true,
        message: 'GWAS Calculations successfully Initiated. Come back later for the GWAS Results',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error initiating GWAS calculations:', error);
      setSnackbar({
        open: true,
        message: 'Failed to initiate GWAS calculations. Please try again.',
        severity: 'error',
      });
    }
  };

  const handleGwasResults = async () => {
    if (gwasResults) {
      setSnackbar({ open: true, message: 'Results are already available.', severity: 'info' });
      return;
    }

    try {
      //change the endpooint here
      const response = await axios.get(`${URL}/api/calculate_chi_square_results/${uuid}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });


      if (response.status === 200) {
        setSnackbar({ open: true, message: 'Results are available.', severity: 'success' });
        setGwasResults(response.data.chi_square_results); // check with backend
        // below condition ensures if the threshold already defined by user earlier, it shall be used when user interacts with the UI again.
      } else {
        setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
      }
    } catch (error) {
      console.error('Error fetching Gwas results:', error);
      setSnackbar({ open: true, message: 'Error fetching results.', severity: 'error' });
    }
  };

  const handleQcInitiate = async () => {
    setIsQcInitiateLoading(true);
    try {
      const resultsAvailable = await checkQcStatus();

      if (resultsAvailable) {
        setSnackbar({
          open: true,
          message: 'QC calculations are already completed.',
          severity: 'info',
        });
        return; // Exit early if results are available
      }

      // Proceed with QC initiation if no results are available
      const response = await axios.post(
        `${URL}/api/datasets/${uuid}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      // console.log('response:', response);
      if (response.status === 200) {
        setTimeout(() => {
          window.location.reload(); // reloads the page after 2 seconds
        }, 1000);
      }


      setSnackbar({
        open: true,
        message: 'QC Calculations successfully Initiated. Come back later for the QC Results',
        severity: 'success',
      });
      setQcInitiated(true);
    } catch (error) {
      console.error('Error initiating QC calculations:', error);
      setSnackbar({
        open: true,
        message: 'Failed to initiate QC calculations. Please try again.',
        severity: 'error',
      });
    } finally {
      setIsQcInitiateLoading(false);
      setQcResultsAvailable(true);
    }
  };
  // handleQcResults function might not be necessary since we are already checking the results in checkQcStatus function --- verify later
  const handleQcResults = async () => {
    if (qcResults) {
      setSnackbar({ open: true, message: 'Results are already available.', severity: 'info' });
      return;
    }

    setIsQcResultsLoading(true);
    try {
      const response = await axios.get(`${URL}/api/datasets/${uuid}/qc-results`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      console.log(response.data);

      if (response.status === 200) {
        setSnackbar({ open: true, message: 'Results are available.', severity: 'success' });
        setQcResultsAvailable(true);
        setQcResults(response.data.full_qc_results); // Store QC results
        // below condition ensures if the threshold already defined by user earlier, it shall be used when user interacts with the UI again.
        if (response.data.threshold !== null) {
          setThreshold(response.data.threshold);
          setThresholdDefined(true);
        } else {
          setThresholdDefined(false)
        }
      } else {
        setSnackbar({ open: true, message: 'Results are not available.', severity: 'info' });
      }
    } catch (error) {
      console.error('Error fetching QC results:', error);
      setSnackbar({ open: true, message: 'Error fetching results.', severity: 'error' });
    } finally {
      setIsQcResultsLoading(false);
      setdisplayQcResults(true);
    }
  };
  // console.log("QC Results", qcResults);
  // const getMatrix = () => {
  //   if (!qcResults) return [];
  //   return qcResults.map((item) => [
  //     item.phi_value,
  //     item.sample1,
  //     item.sample2
  //   ]);
  // };
  // const matrix = getMatrix();

  // const handleSliderChange = (event, newValue) => {
  //   setThresholdDefined(false);
  //   setThreshold(newValue);
  // };

  // console.log("matrix",matrix);

  // const filterData = (threshold) => {
  //   const filteredData = matrix.filter(row => row.phi_value >= threshold);
  //   setFilteredResults(filteredData);
  // };

  // // Re-filter the data when threshold changes
  // useEffect(() => {
  //   const filteredResults = matrix.filter(row => row[0] < threshold);
  //   console.log('Filtered Results:', filteredResults);
  //   // Only set state if filtered results have changed (compare with previous state)
  //   if (JSON.stringify(filteredResults) !== JSON.stringify(prevFilteredResultsRef.current)) {
  //     setFilteredResults(filteredResults);
  //     prevFilteredResultsRef.current = filteredResults; // Update the ref with the current filtered results
  //   }
  // }, [threshold, matrix]);

  // const getGroupedSampleCounts = (qcResults, threshold) => {
  //   if (!qcResults || !Array.isArray(qcResults)) return { userCounts: {}, totalSamples: 0, filteredData: [] }; // Safety check

  //   const userSamples = {}; // Object to track unique samples per user

  //   // Filter data first based on threshold
  //   const filteredData = qcResults.filter(({ phi_value }) => phi_value < threshold);

  //   filteredData.forEach(({ sample1, sample2, user1, user2 }) => {
  //     if (!userSamples[user1]) userSamples[user1] = new Set();
  //     if (!userSamples[user2]) userSamples[user2] = new Set();

  //     userSamples[user1].add(sample1);
  //     userSamples[user2].add(sample2);
  //   });

  //   const userSamplesList = {};
  //   Object.keys(userSamples).forEach(user => {
  //       userSamplesList[user] = Array.from(userSamples[user]);
  //   });

  //   console.log("Unique Samples per User:", userSamplesList);

  //   // Calculate total samples per user and overall count
  //   let totalSamples = 0;
  //   const userCounts = {};
  //   Object.keys(userSamples).forEach(user => {
  //     userCounts[user] = userSamples[user].size;
  //     totalSamples += userSamples[user].size;
  //   });

  //   return { userCounts, totalSamples, filteredData };
  // };

  // const handleSliderChange = (event, newValue) => {
  //   setThreshold(newValue);
  //   if (!qcResults || !Array.isArray(qcResults)) return;
  //   const { userCounts, totalSamples, filteredData } = getGroupedSampleCounts(qcResults, newValue);
  //   setFilteredResults({ userCounts, filteredData });
  //   setThresholdDefined(false);
  // };

  // useEffect(() => {
  //   if (!qcResults || !Array.isArray(qcResults) || qcResults.length === 0) return;
  //   const { userCounts, totalSamples, filteredData } = getGroupedSampleCounts(qcResults, threshold);
  //   console.log("Updated User-wise sample count:", userCounts);
  //   console.log("Updated Total unique samples:", totalSamples);
  //   setFilteredResults({ userCounts, filteredData });
  // }, [threshold, qcResults]);

  // console.log('Creators Datasets Number of Samples', collaboration.creator_datasets.samples);
  // console.log('Collabortator Datasets Number of Samples', invitedUsers[0].number_of_samples);
  const getUserName = (userId) => {
    if (senderInfo.id === userId) return senderInfo.name; // Check if sender matches
    const invitedUser = invitedUsers?.find(user => user.user_id === userId);
    return invitedUser ? invitedUser.name : "Unknown User"; // Return name if found
  };
  // Function below will only work for single collaborator and initiator (might need change for multi user)
  const getCurrentUserId = (role) => {
    return role === 'sender'
      ? senderInfo.id
      : invitedUsers?.[0]?.user_id || null;
  };
  const currentUserId = getCurrentUserId(role);
  console.log(currentUserId);


  // const getGroupedSampleCounts = (qcResults, threshold) => {
  //   if (!qcResults || !Array.isArray(qcResults)) return {
  //     userCounts: {},
  //     totalSamples: 0,
  //     selectedSamples: 0,
  //     filteredData: [],
  //     userSamplesList: {}
  //   };

  //   const userSamples = {};
  //   const allUniqueSamples = new Set();
  //   const selectedUniqueSamples = new Set();

  //   const filteredData = qcResults.filter(({ phi_value }) => phi_value < threshold);

  //   qcResults.forEach(({ sample1, sample2 }) => {
  //     allUniqueSamples.add(sample1);
  //     allUniqueSamples.add(sample2);
  //   });

  //   filteredData.forEach(({ sample1, sample2, user1, user2 }) => {
  //     if (!userSamples[user1]) userSamples[user1] = new Set();
  //     if (!userSamples[user2]) userSamples[user2] = new Set();

  //     userSamples[user1].add(sample1);
  //     userSamples[user2].add(sample2);

  //     selectedUniqueSamples.add(sample1);
  //     selectedUniqueSamples.add(sample2);
  //   });
  //   const userSamplesList = {};
  //   Object.keys(userSamples).forEach(user => {
  //     userSamplesList[user] = Array.from(userSamples[user]);
  //   });

  //   // Calculate sample counts
  //   return {
  //     userCounts: Object.fromEntries(Object.entries(userSamples).map(([user, samples]) => [user, samples.size])),
  //     totalSamples: allUniqueSamples.size,
  //     selectedSamples: selectedUniqueSamples.size,
  //     filteredData,
  //     userSamplesList
  //   };
  // };


  const getGroupedSampleCounts = (qcResults, newThreshold) => {
    if (!qcResults || !Array.isArray(qcResults)) return {
      userCounts: {},
      totalSamples: 0,
      selectedSamples: 0,
      filteredData: [],
      userSamplesList: {}
    };

    const userSamples = {};
    const allUniqueSamples = new Set();
    const selectedUniqueSamples = new Set();

    // Filtered data for display (phi < threshold)
    const filteredData = qcResults.filter(({ phi_value }) => phi_value < newThreshold);

    // Process ALL QC results to determine sample inclusion
    qcResults.forEach(({ user1, sample1, user2, sample2, phi_value }) => {
      // Track all unique samples
      allUniqueSamples.add(sample1);
      allUniqueSamples.add(sample2);

      // Initialize user sets if needed
      if (!userSamples[user1]) userSamples[user1] = new Set();
      if (!userSamples[user2]) userSamples[user2] = new Set();

      // Add/remove samples based on threshold comparison
      if (phi_value > newThreshold) {
        userSamples[user1].delete(sample1);
        userSamples[user2].delete(sample2);
      } else {
        userSamples[user1].add(sample1);
        userSamples[user2].add(sample2);
      }
    });

    // Calculate selected samples from final user sets
    Object.values(userSamples).forEach(samples => {
      samples.forEach(sample => selectedUniqueSamples.add(sample));
    });

    // Convert sets to arrays for output
    const userSamplesList = {};
    Object.keys(userSamples).forEach(user => {
      userSamplesList[user] = Array.from(userSamples[user]);
    });

    return {
      userCounts: Object.fromEntries(
        Object.entries(userSamples).map(([user, samples]) => [user, samples.size])
      ),
      totalSamples: allUniqueSamples.size,
      selectedSamples: selectedUniqueSamples.size,
      filteredData, // Maintain original filtered data for display
      userSamplesList
    };
  };



  useEffect(() => {
    if (qcResults && newThreshold !== null) {
      const { userCounts, totalSamples, selectedSamples, filteredData, userSamplesList } =
        getGroupedSampleCounts(qcResults, newThreshold);

      setFilteredResults({ userCounts, totalSamples, selectedSamples, filteredData, userSamplesList });
    }
  }, [qcResults, newThreshold]);


  // const downloadSamples = (samples, filename) => {
  //   try {
  //     if (!samples || samples.length === 0) {
  //       alert("No samples to download.");
  //       return;
  //     }

  //     const jsonContent = JSON.stringify(samples, null, 2);
  //     const blob = new Blob([jsonContent], { type: "application/json" });

  //     const link = document.createElement("a");
  //     const url = window.URL.createObjectURL(blob);
  //     link.href = url;
  //     link.download = filename;
  //     document.body.appendChild(link);
  //     link.click();
  //     window.URL.revokeObjectURL(url);
  //     document.body.removeChild(link);
  //   } catch (error) {
  //     console.error("Download error:", error);
  //     alert(`Download failed: ${error.message}`);
  //   }
  // };

  console.log('Number of samples Creator:', creator?.samples, invitedUsers[0]?.number_of_samples, invitedUsers[0]?.name, senderInfo?.name);
  const downloadSamples = (samples, filename) => {
    try {
      if (!samples || samples.length === 0) {
        alert("No samples to download.");
        return;
      }

      // Wrap the samples in a list property
      const jsonContent = JSON.stringify({ "Sample IDs": samples }, null, 2);

      const blob = new Blob([jsonContent], { type: "application/json" });

      const link = document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
      alert(`Download failed: ${error.message}`);
    }
  };


  const handleSliderChange = (event, newValue) => {
    setNewThreshold(newValue);
    // setThreshold(newValue);
  };

  // utility functions for Data Export
  const convertToCSV = (data, file_name) => {
    const title = `${file_name} - GWAS Experiment Report`;
    const headers = ['SNP ID,Chi-Square,P-Value'];
    const rows = data.map(snp =>
      `"${snp.snpKey}",${snp.chi},${snp.pValue}`
    );
    return [title, ...headers, ...rows].join('\n');
  };

  const handleDownload = (userId, data) => {
    try {

      let file_name;
      if (userId !== 'aggregated') {
        file_name = getUserName(userId);
      } else {
        file_name = 'Joint'
      }

      const csvContent = convertToCSV(data, file_name);

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = window.URL.createObjectURL(blob);
      link.href = url;
      link.download = `${file_name}_GWAS_results.csv`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error.message}`);
    }
  };


  const gwasResultPreview = useMemo(() => {
    if (!gwasResults) return [];

    return Object.entries(gwasResults).map(([userId, userSnps]) => {
      const sortedSnps = Object.entries(userSnps)
        .map(([snpKey, values]) => {
          // const snpNumber = snpKey.match(/(\d+)$/)?.[1] || 'N/A';
          return {
            snpKey,
            chi: values.chi_square,
            pValue: values.p_value
          };
        })
        .sort((a, b) => a.pValue - b.pValue);

      return { userId, sortedSnps };
    });
  }, [gwasResults]);

  // console.log('Gwas Results:', gwasResults);


  const userAcceptedInvitation = invitedUsers.length > 0 && invitedUsers.every(user => user.status === 'accepted');
  // check if sender and all user accepted the invitation and invited user has uploaded the dataset and qc results are not available
  const isQcInitiateEnabled = role === 'sender' && userAcceptedInvitation && invitedUsers[0].is_dataset_uploaded && !qcResultsAvailable;

  const isQcResultsEnabled = !isQcInitiateEnabled && qcResultsAvailable;

  const isGwasInitiateEnabled =
    role === 'sender' && qcResultsAvailable && thresholdDefined && !gwasResultsAvailable;

  const isGwasResultsEnabled = !isGwasInitiateEnabled && gwasResultsAvailable;

  useEffect(() => {
    if (isQcResultsEnabled) {
      setActiveStep(1); // Automatically move to next step when QC calculation is ready
    }
    if (isGwasResultsEnabled) {
      setActiveStep(2);
    }
  }, [isQcResultsEnabled, isGwasInitiateEnabled]);

  useEffect(() => {
    checkQcStatus();
    checkGwasStatus();
  }, [qcResultsAvailable]);

  console.log("QC Results", isQcResultsEnabled);


  const progressSteps = [{
    label: 'Onboarding Collaborators',
    description: !userAcceptedInvitation ? 'Waiting for Collaborator to accept the invitation' : 'Waiting for Collaborator to upload Quality Control data.'
  },
  {
    label: 'QC Calculation',
    description: !qcResultsAvailable ? 'Awaiting the initiator to start the QC calculation' : 'QC results are available, waiting for initator to confirm the Threshold.'
  },
  {
    label: 'Stat Data',
    description: 'Waiting for all parties involved to upload their Stat Data.'
  },
  {
    label: 'Final Experiment',
    description: !gwasResultsAvailable ? 'Awaiting the initiator to perform operations.' : 'Final Results available'
  },
  ];

  const getActiveStep = () => {
    // if all user accept the invitation it moves forward else not
    if (!(userAcceptedInvitation && invitedUsers[0].is_dataset_uploaded)) {
      setProgressActiveStep(0);
      return;
    }
    // if QC Results not avaialble, it stays here
    if (invitedUsers[0].is_dataset_uploaded && !thresholdDefined) {
      setProgressActiveStep(1);
      return;
    }
    // if ((thresholdDefined && Object.keys(gwasResults).length === 0)) {
    //   setProgressActiveStep(2);
    //   return;
    // }

    if (thresholdDefined && !collaboration?.stat_uploaded) {
      setProgressActiveStep(2);
      return;
    }

    if ((collaboration?.stat_uploaded && !gwasResultsAvailable)) {
      setProgressActiveStep(3);
      return;
    }

    if ((isGwasResultsEnabled)) {
      setProgressActiveStep(4);
      return;
    }// All steps completed
  };
  useEffect(() => {
    getActiveStep();
  }, [invitedUsers, qcResultsAvailable, thresholdDefined, gwasResultsAvailable, displayQcResults]);

  // Experiments Tabs:
  const placeholderTabs = ['Chi-Square', 'Odd Ratio', 'GWAS Experiment 3', 'GWAS Experiment 4', 'GWAS Experiment 5'];

  const handleExperimentChange = (index) => {
    if (index === 0) {
      setdisplayQcResults(false);
    } else {
      setdisplayQcResults(true);
    }
  }


  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" align="left" gutterBottom sx={{ fontWeight: 'light' }}>
        Collaboration Details
      </Typography>

      <Grid container spacing={4}>
        {/* Left Column */}
        <Grid item xs={12} md={8}>
          {/* Collaboration Details Card */}
          {/* <Card sx={{ height: '100%', marginBottom: '20px', border: '1px solid #ccc', borderRadius: 2, boxShadow: 'none', p:0 }}> */}
          <Card sx={{ height: '100%', marginBottom: '20px', p: 0, boxShadow: 'none' }}>
            <CardContent sx={{ p: 0 }}>
              {/* Header */}
              {/* <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  <strong>About Collaboration</strong>
                </Typography>
                <Divider sx={{ flexGrow: 30, borderColor: 'black' }} />
                {role === 'sender' && !isEditing && (
                  <Tooltip arrow title="Edit Collaboration Details">
                    <IconButton
                      onClick={() => {
                        // Store original values before editing
                        setOriginalCollabName(collabName);
                        setOriginalExperimentList([...experimentList]);
                        setOriginalPhenoType(phenoType);
                        setOriginalSamples(samples);
                        setIsEditing(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box> */}

              {/* List of Details */}
              <Box sx={{ bgcolor: '#ffffff', p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <List sx={{ pt: 0, pb: 0 }}>
                  {/* Collaboration Name */}
                  {role === 'sender' ? (
                    isEditing ? (
                      <TextField
                        label="Collaboration Name"
                        variant="outlined"
                        fullWidth
                        sx={{ mt: 2 }}
                        value={collabName}
                        onChange={(e) => setCollabName(e.target.value)}
                      />
                    ) : (
                      <Typography variant="body1">
                        <strong>Title:</strong> {collabName}
                      </Typography>
                    )
                  ) : (
                    <Typography variant="body1">
                      <strong>Title:</strong> {collabName}
                    </Typography>
                  )}
                  {/* Experiments */}
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<strong>Experiments</strong>}
                      secondary={
                        role === 'sender' ? (
                          isEditing ? (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                <TextField
                                  variant="outlined"
                                  value={experimentName}
                                  onChange={(e) => setExperimentName(e.target.value)}
                                  size="small"
                                  sx={{ mr: 2, flexGrow: 1 }}
                                />
                                <Tooltip arrow title="Add a new experiment">
                                  <Button variant="contained" color="primary" startIcon={<Add />} onClick={handleAddExperiment}>
                                    Add
                                  </Button>
                                </Tooltip>
                              </Box>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                                {experimentList.map((experiment, index) => (
                                  <Chip
                                    key={index}
                                    label={experiment}
                                    onDelete={() => handleDeleteExperiment(index)}
                                    color="primary"
                                    variant="outlined"
                                  />
                                ))}
                              </Box>
                            </>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                              {experimentList.map((experiment, index) => (
                                <Chip key={index} label={experiment} color="primary" variant="outlined" />
                              ))}
                            </Box>
                          )
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                            {experimentList.map((experiment, index) => (
                              <Chip key={index} label={experiment} color="primary" variant="outlined" />
                            ))}
                          </Box>
                        )
                      }
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />


                  {/* Phenotype */}
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Phenotype from Initiator data' placement='right'><strong>Phenotype</strong></Tooltip>}
                      secondary={
                        role === 'sender' ? (
                          isEditing ? (
                            <TextField
                              variant="outlined"
                              fullWidth
                              value={phenoType}
                              onChange={(e) => setPhenotype(e.target.value)}
                            />
                          ) : (
                            <Typography variant="body2">{phenoType}</Typography>
                          )
                        ) : (
                          <Typography variant="body2">{phenoType}</Typography>
                        )
                      }
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Samples to be included in this collaboration' placement='right'><strong>Number of Samples</strong></Tooltip>}
                      secondary={
                        <Box display={'inline-flex'} gap={2} sx={{ color: 'text.primary' }}>
                          <Typography variant="body2">{senderInfo?.name} : {creator?.samples}</Typography>
                          <Typography variant="body2">{invitedUsers[0]?.name}: {invitedUsers[0]?.number_of_samples}</Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />
                  <ListItem disableGutters>
                    <ListItemText
                      primary={<Tooltip arrow title='Quality Control Scheme' placement='right'><strong>QC Scheme</strong></Tooltip>}
                      secondary={
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          <Chip key='Sample Relatedness' label='Sample Relatedness' variant="contained" sx={{backgroundColor:"#D1E3F6", color:'#0D3B69'}}/>
                        </Box>
                      }
                    />
                  </ListItem>
                </List>
              </Box>

              {/*Quality Control Data Upload - After user accepts the request, upload the data for their phenotype color: #f9_fdff*/}
              {(userAcceptedInvitation && !invitedUsers[0].is_dataset_uploaded) && role === 'receiver' && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List>
                    <ListItem sx={{ width: '100%', display: 'block' }}>
                      <ListItemText
                        primary={<Typography variant="h6" fontWeight="bold">Upload Quality Control Data</Typography>}
                      />
                      <Box>
                        <Tooltip placement="bottom" arrow title={file ? "File already selected" : "Upload file must be in CSV or JSON format."}>
                          <span>
                            <Button
                              variant="outlined"
                              component="label"
                              fullWidth
                              sx={{ mt: 1, borderRadius: 10 }}
                            >
                              {file ? file.name : "Select QC Data"}
                              <input type="file" hidden onChange={handleFileUpload} />
                            </Button>
                          </span>
                        </Tooltip>


                        {/* Submit Button */}
                        {file && (
                          <>
                            <Button variant="contained" color="primary" fullWidth sx={{ mt: 2, borderRadius: 10 }} onClick={handleQcUpload}>
                              Upload QC Data
                            </Button>
                            <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2 }} display={'flex'}>
                              <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                              <Typography variant="body2">{file.name} will be linked to {invitedUsers[0].phenotype} for this collaboration.</Typography>
                            </Box>
                          </>
                        )}

                      </Box>
                    </ListItem>
                  </List>
                </Box>
              )}
              {(isQcInitiateEnabled || isQcResultsEnabled) && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List sx={{ py: 0 }}>
                    <ListItem disableGutters sx={{ display: 'block', pt: 0, pb: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h2" sx={{ flexGrow: 1, fontSize: 20, fontWeight: 'bold' }}>
                          Quality Control
                        </Typography>
                        <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                      </Box>
                      {(role === 'receiver' && !thresholdDefined) && (
                        <Box sx={{ bgcolor: '#e8f1fa', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                          <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="body2">Results will be available soon.</Typography>
                        </Box>
                      )}
                      {role === 'sender' && (
                        <ListItemText
                          sx={{ width: '100%', display: 'block' }}
                          secondary={
                            <Box
                              sx={{
                                display: 'flex',
                                gap: 2,
                                mt: 1,
                                width: '100%', // Ensure the Box takes full width of its parent
                              }}
                            >
                              <Box sx={{ flex: 1, mt: 1 }}>
                                <Tooltip
                                  arrow title={
                                    isQcInitiateLoading || isQcResultsEnabled
                                      ? isQcResultsEnabled
                                        ? 'Get QC Results'
                                        : 'Results not available to preview'
                                      : !isQcInitiateEnabled
                                        ? 'QC calculations already initiated or waiting for Collaborators'
                                        : role === 'receiver'
                                          ? 'Receiver cannot initiate QC calculations'
                                          : 'Initiate QC Calculations'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant={isQcResultsEnabled ? "outlined" : "contained"}
                                      color={isQcResultsEnabled ? "secondary" : "primary"}
                                      onClick={isQcResultsEnabled ? handleQcResults : handleQcInitiate}
                                      disabled={
                                        (isQcInitiateLoading && !isQcResultsEnabled) ||
                                        (!isQcInitiateEnabled && !isQcResultsEnabled) ||
                                        isQcResultsLoading ||
                                        role === 'receiver'
                                      }
                                      startIcon={
                                        (isQcInitiateLoading || isQcResultsLoading) && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      {isQcResultsEnabled ? "Get QC Results" : "Initiate QC Calculation"}
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box>


                              {/* QC Initiate Button */}
                              {/* <Box sx={{ flex: 1 }}>
                                <Tooltip
                                  arrow title={
                                    !isQcInitiateEnabled
                                      ? 'QC calculations already initiated or waiting for Collaborators'
                                      : role === 'receiver'
                                        ? 'Receiver cannot initiate QC calculations'
                                        : 'Initiate QC Calculations'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      onClick={handleQcInitiate}
                                      disabled={!isQcInitiateEnabled || isQcInitiateLoading}
                                      startIcon={
                                        isQcInitiateLoading && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      Initiate QC Calculation
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box> */}

                              {/* QC Results Button */}
                              {/* <Box sx={{ flex: 1 }}>
                                <Tooltip
                                  arrow title={
                                    !isQcResultsEnabled
                                      ? 'Results not available to preview'
                                      : role === 'receiver'
                                        ? 'Receiver cannot initiate QC results'
                                        : 'Get QC Results'
                                  }
                                  placement="bottom"
                                >
                                  <span>
                                    <Button
                                      variant="outlined"
                                      color="secondary"
                                      onClick={handleQcResults}
                                      disabled={!isQcResultsEnabled || isQcResultsLoading || role === 'receiver'}
                                      startIcon={
                                        isQcResultsLoading && (
                                          <CircularProgress size={20} color="inherit" />
                                        )
                                      }
                                      fullWidth
                                      sx={{ borderRadius: 20 }}
                                    >
                                      QC Results
                                    </Button>
                                  </span>
                                </Tooltip>
                              </Box> */}
                            </Box>
                          }
                        />
                      )}
                      {/*Place holder for Progress Bar at Receiver's End*/}
                    </ListItem>
                    {(displayQcResults && (role === 'sender' || role === 'receiver')) && (
                      <>
                        {role === 'sender' && (
                          <>
                            <ListItem disableGutters sx={{ mt: 2 }}>
                              <ListItemText
                                primary={<strong>Select Threshold Value</strong>}
                                secondary={
                                  <Box sx={{ mt: 1 }}>
                                    <Slider
                                      value={newThreshold}
                                      onChange={handleSliderChange}
                                      aria-labelledby="threshold-slider"
                                      valueLabelDisplay="auto"
                                      step={0.01}
                                      min={0}
                                      max={1}
                                      sx={{
                                        color: "primary",
                                        height: 8,
                                        "& .MuiSlider-track": { border: "none" },
                                        "& .MuiSlider-thumb": {
                                          height: 24,
                                          width: 24,
                                          backgroundColor: "#fff",
                                          border: "2px solid currentColor",
                                          "&:focus, &:hover, &.Mui-active, &.Mui-focusVisible": { boxShadow: "inherit" },
                                          "&::before": { display: "none" },
                                        },
                                        "& .MuiSlider-valueLabel": {
                                          lineHeight: 1.2,
                                          fontSize: 12,
                                          background: "unset",
                                          padding: 0,
                                          width: 32,
                                          height: 32,
                                          borderRadius: "50% 50% 50% 0",
                                          backgroundColor: "#1876D1",
                                          transformOrigin: "bottom left",
                                          transform: "translate(50%, -100%) rotate(-45deg) scale(0)",
                                          "&::before": { display: "none" },
                                          "&.MuiSlider-valueLabelOpen": { transform: "translate(50%, -100%) rotate(-45deg) scale(1)" },
                                          "& > *": { transform: "rotate(45deg)" },
                                        },
                                      }}
                                    />
                                    <Box sx={{ mb: 1 }}>
                                      <Typography variant="body2" gutterBottom>
                                        Current Threshold: {!thresholdDefined ? 'Please select a threshold.' : threshold}
                                      </Typography>
                                      {((newThreshold !== threshold) &&
                                        <Typography variant="body2" gutterBottom>
                                          New Threshold: {newThreshold}
                                        </Typography>
                                      )}
                                    </Box>
                                    <Tooltip arrow title={newThreshold === threshold ? 'Threshold Defined' : 'Confirm your selected threshold value'} placement="bottom">
                                      <Button variant="contained" color="primary" onClick={handleSubmitThreshold} sx={{ borderRadius: 10 }} disabled={newThreshold === threshold}>
                                        {(newThreshold === threshold) ? 'Threshold Defined' : `Confirm Threshold`}
                                      </Button>
                                    </Tooltip>
                                    {/* {matrix.length > 0 ? (
                              <p>
                                Showing {filteredResults.length} out of {matrix.length} groups
                                below threshold ({threshold.toFixed(2)})
                              </p>
                            ) : (
                              <p>No data available</p>
                            )} */}

                                  </Box>
                                }
                              />
                            </ListItem>
                            <Divider sx={{ borderColor: 'primary.main' }} />
                          </>
                        )}

                        {/* QC Results Section */}
                        {thresholdDefined && (
                          <ListItem disableGutters sx={{ mt: 1 }}>
                            <ListItemText
                              primary={<strong>QC Results</strong>}
                              secondary={
                                qcResults ? (
                                  <Box>
                                    {/* Total Samples Typography Block */}
                                    <Box sx={{ mb: 2 }}>
                                      <Typography variant="body1" fontWeight={500} color="text.primary">
                                        Total samples to be included in GWAS experiment:{" "}
                                        <Box component="span" fontWeight={700} color="primary.main">
                                          {filteredResults?.selectedSamples || 0}
                                        </Box>{" "}
                                        out of{" "}
                                        <Box component="span" fontWeight={700} color="text.secondary">
                                          {filteredResults?.totalSamples || 0}
                                        </Box>
                                      </Typography>
                                    </Box>

                                    {/* Accordions */}
                                    {Object.entries(filteredResults?.userCounts || {}).map(([userId, count]) => (
                                      <Tooltip
                                        key={userId}
                                        arrow title={userId !== currentUserId ? "You are not allowed to view this collection due to privacy reasons." : ""}
                                      >
                                        <Box>
                                          <Accordion
                                            disabled={userId !== currentUserId}
                                            expanded={userId === currentUserId ? undefined : false}
                                            elevation={0}
                                            sx={{
                                              mb: '10px !important',
                                              border: '1px solid',
                                              borderRadius: '12px !important',
                                              borderColor: 'divider',
                                              overflow: 'hidden',
                                              '&:before': { display: 'none' },
                                              '&.Mui-disabled': {
                                                opacity: 1,
                                                pointerEvents: 'none',
                                                bgcolor: 'action.hover',
                                                borderRadius: 3
                                              },
                                              '&.Mui-expanded': {
                                                transition: 'all 0.3s ease',
                                              }
                                            }}
                                          >
                                            <AccordionSummary
                                              expandIcon={userId === currentUserId ? null : <ExpandMoreIcon />}
                                              sx={{
                                                px: 3,
                                                borderRadius: 3,
                                                '&:hover': { bgcolor: 'action.hover' },
                                                // Disable rotation only for current user
                                                ...(userId === currentUserId && {
                                                  '& .MuiAccordionSummary-expandIconWrapper': {
                                                    transform: 'none !important',
                                                  },
                                                  '& .Mui-expanded .MuiAccordionSummary-expandIconWrapper': {
                                                    transform: 'none !important',
                                                  },
                                                }),
                                              }}
                                            >
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                                                {/* Existing avatar and user info */}
                                                <Box
                                                  sx={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: '50%',
                                                    bgcolor: userId === currentUserId ? 'primary.main' : 'grey.300',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid',
                                                    borderColor: userId === currentUserId ? 'primary.dark' : 'divider',
                                                    '&::after': userId !== currentUserId ? undefined : {
                                                      content: '""',
                                                      width: 14,
                                                      height: 14,
                                                      borderRadius: '50%',
                                                      bgcolor: 'white'
                                                    }
                                                  }}
                                                />
                                                <Box sx={{ flexGrow: 1 }}>
                                                  <Typography
                                                    variant="subtitle1"
                                                    fontWeight={600}
                                                    color={userId === currentUserId ? 'primary.main' : 'text.primary'}
                                                    sx={{ letterSpacing: '-0.02em' }}
                                                  >
                                                    {getUserName(userId)}
                                                  </Typography>
                                                  <Typography
                                                    variant="body2"
                                                    color={userId === currentUserId ? 'primary.dark' : 'text.secondary'}
                                                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                                                  >
                                                    <Box component="span" fontWeight={500}>{count} Samples</Box>
                                                    <Box component="span" sx={{ color: 'text.disabled' }}>•</Box>
                                                    <Box component="span">{userId === currentUserId ? 'Your collection' : 'Collaborator'}</Box>
                                                  </Typography>
                                                </Box>

                                                {userId === currentUserId && (
                                                  <>
                                                    {userId === currentUserId && filteredResults.userSamplesList[userId]?.length > 0 && (
                                                      <Box>
                                                        <Button
                                                          fullWidth
                                                          variant="contained"
                                                          size="small"
                                                          onClick={() => downloadSamples(filteredResults.userSamplesList[userId], 'my_samples.json')}
                                                          endIcon={<DownloadRounded sx={{ fontSize: '10px' }} />}
                                                          sx={{
                                                            borderRadius: 10,
                                                            boxShadow: 0,
                                                            bgcolor: 'primary.main',
                                                            fontSize: 10,
                                                            '&:hover': {
                                                              bgcolor: 'primary.dark'
                                                            }
                                                          }}
                                                        >
                                                          Export Your Samples
                                                        </Button>
                                                      </Box>
                                                    )}
                                                    <Box
                                                      sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                      }}
                                                    >
                                                      <Button
                                                        fullWidth
                                                        variant="outlined"
                                                        size="small"
                                                        sx={{
                                                          borderRadius: 10,
                                                          boxShadow: 0,
                                                          fontSize: 10,
                                                        }}
                                                      >
                                                        Preview
                                                      </Button>
                                                    </Box>
                                                  </>
                                                )}
                                              </Box>
                                            </AccordionSummary>

                                            <AccordionDetails sx={{ pt: 2, pb: 2, px: 3, height: '400px', }}>
                                              {filteredResults.userSamplesList[userId] && filteredResults.userSamplesList[userId].length > 0 ? (
                                                <Box sx={{
                                                  height: 'calc(100%)',
                                                  overflowY: 'auto',
                                                  pr: 1,
                                                }}>
                                                  {filteredResults.userSamplesList[userId].map((sample, index) => (
                                                    <Box
                                                      key={index}
                                                      sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        py: 1.5,
                                                        px: 2,
                                                        bgcolor: 'background.paper',
                                                        mb: 1,
                                                        borderRadius: 3,
                                                        border: '1px solid',
                                                        borderColor: 'divider',
                                                      }}
                                                    >
                                                      <Box sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        bgcolor: 'primary.main',
                                                        mr: 2,
                                                        flexShrink: 0
                                                      }} />
                                                      <Typography
                                                        variant="body1"
                                                        fontFamily="monospace"
                                                        sx={{
                                                          fontWeight: 500,
                                                          color: 'text.primary',
                                                          wordBreak: 'break-word'
                                                        }}
                                                      >
                                                        {sample}
                                                      </Typography>
                                                    </Box>
                                                  ))}
                                                </Box>
                                              ) : (
                                                <Typography
                                                  variant="body2"
                                                  color="text.secondary"
                                                  sx={{
                                                    py: 2,
                                                    px: 3,
                                                    bgcolor: 'action.hover',
                                                    borderRadius: 3,
                                                    border: '1px solid',
                                                    borderColor: 'divider',
                                                    textAlign: 'center'
                                                  }}
                                                >
                                                  No contributions recorded yet
                                                </Typography>
                                              )}


                                            </AccordionDetails>
                                          </Accordion>
                                        </Box>
                                      </Tooltip>
                                    ))}
                                  </Box>



                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    No QC results to display.
                                  </Typography>
                                )
                              }
                            />
                          </ListItem>
                        )}
                      </>
                    )}
                    <>
                      <ListItem disableGutters>
                        {(thresholdDefined && !collaboration?.stat_uploaded) && (
                          <>
                            {collaboration?.missing_stat_user?.includes(currentUserId) ? (<ListItemText
                              primary={
                                <Box sx={{
                                  position: 'relative',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  width: '100%',
                                  pr: 4 // Right padding for icon spacing
                                }}>
                                  <strong>Upload Stat</strong>
                                  <Accordion
                                    expanded={expanded}
                                    onChange={() => setExpanded(!expanded)}
                                    sx={{
                                      position: 'absolute',
                                      right: 0,
                                      m: 0,
                                      bgcolor: 'transparent',
                                      boxShadow: 'none',
                                      '&:before': { display: 'none' },
                                      '&.Mui-expanded': {
                                        margin: '0 !important',
                                        position: 'absolute',
                                        zIndex: 1
                                      }
                                    }}
                                  >
                                    <AccordionSummary
                                      expandIcon={
                                        <Tooltip title="Show Instructions" arrow placement='left'>
                                          <Box display={'inline-flex'} sx={{ gap: 1 }}>
                                            <Button
                                              fullWidth
                                              variant="contained"
                                              size="small"
                                              endIcon={<InfoIcon />}
                                              sx={{
                                                borderRadius: 10,
                                                boxShadow: 0,
                                                fontSize: 10,
                                                bgcolor: '#e8f1fa',
                                                color: 'primary.main',
                                                '&:hover': { color: 'white' }
                                              }}
                                            >
                                              Learn More
                                            </Button>
                                          </Box>
                                        </Tooltip>
                                      }
                                      sx={{
                                        p: 0,
                                        minHeight: 'auto !important',
                                        '& .MuiAccordionSummary-expandIconWrapper': {
                                          transform: 'none !important'
                                        },
                                        '&.Mui-expanded .MuiAccordionSummary-expandIconWrapper': {
                                          transform: 'none !important'
                                        },
                                        '& .MuiAccordionSummary-content': {
                                          m: '0 !important',
                                          flexGrow: 0
                                        },
                                        '&.Mui-expanded': {
                                          minHeight: 'auto !important'
                                        }
                                      }}

                                    />
                                  </Accordion>
                                </Box>
                              }
                              secondary={
                                <>
                                  <AccordionDetails sx={{
                                    p: expanded ? 2 : 0,
                                    bgcolor: '#e8f1fa',
                                    borderRadius: '11px',
                                    mt: 1,
                                    display: expanded ? 'block' : 'none'
                                  }}>
                                    <Typography variant="body1" sx={{
                                      pb: 0.5,
                                      mb: 1,
                                      color: 'text.primary',
                                      borderBottom: '1px solid',
                                      borderColor: 'divider',
                                      fontWeight: 500
                                    }}>
                                      Instructions
                                    </Typography>
                                    <Box sx={{ position: 'relative' }}>
                                      {/* Download Section */}
                                      <Box sx={{ mb: 3, display: 'flex', position: 'relative' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            Download Script to Generate Stat Data
                                          </Typography>
                                          <Button
                                            variant="outlined"
                                            size="small"
                                            endIcon={<DownloadRounded />}
                                            sx={{
                                              borderRadius: 10,
                                              boxShadow: 'none',
                                              textTransform: 'none',
                                              '&:hover': { boxShadow: 'none' }
                                            }}
                                          >
                                            Python Script
                                          </Button>
                                          <Typography variant="caption" color="text.secondary" sx={{
                                            display: 'block',
                                            mt: 1,
                                            fontSize: '0.75rem'
                                          }}>
                                            Python script for standardized SNP data formatting
                                          </Typography>
                                        </Box>
                                      </Box>

                                      {/* Format Section */}
                                      <Box sx={{ mb: 3, display: 'flex' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            Accepted Formats
                                          </Typography>
                                          <Box sx={{ display: 'flex', gap: 1.5 }}>
                                            <Chip
                                              label="CSV"
                                              color="primary"
                                              size="small"
                                              variant="outlined"
                                              icon={<CheckCircleIcon fontSize="small" />}
                                              sx={{ borderRadius: 3, fontWeight: 500 }}
                                            />
                                            <Chip
                                              label="JSON"
                                              color="primary"
                                              size="small"
                                              variant="outlined"
                                              icon={<CheckCircleIcon fontSize="small" />}
                                              sx={{ borderRadius: 3, fontWeight: 500 }}
                                            />
                                          </Box>
                                        </Box>
                                      </Box>

                                      {/* Example Preview */}
                                      <Box sx={{ mb: 2, display: 'flex' }}>
                                        <ArrowRightIcon sx={{
                                          fontSize: '20px',
                                          color: 'primary.main',
                                          flexShrink: 0,
                                          mt: '2px'
                                        }} />
                                        <Box sx={{ flexGrow: 1, ml: 1.5 }}>
                                          <Typography variant="body2" sx={{
                                            mb: 1.5,
                                            color: 'text.primary',
                                            fontWeight: 500
                                          }}>
                                            File Structure Example
                                          </Typography>
                                          <Box sx={{
                                            border: '1px solid',
                                            borderColor: 'primary.main',
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            bgcolor: 'common.white',
                                            maxWidth: 400
                                          }}>
                                            <img
                                              src={statSampleImage}
                                              alt="File format example"
                                              style={{
                                                width: '100%',
                                                objectFit: 'contain',
                                                padding: 5,
                                                borderRadius: 10
                                              }}
                                            />
                                          </Box>
                                          <Typography variant="caption" color="text.secondary" sx={{
                                            display: 'block',
                                            mt: 1,
                                            fontSize: '0.75rem'
                                          }}>
                                            Required columns: snp_ids, case, controls
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </Box>
                                  </AccordionDetails>

                                  {/* File Upload Section */}
                                  <Tooltip placement="bottom" arrow title={file ? "File already selected" : "Upload file must be in CSV or JSON format."}>
                                    <span>
                                      <Button
                                        variant="outlined"
                                        component="label"
                                        fullWidth
                                        sx={{ mt: 1, borderRadius: 10 }}
                                      >
                                        {file ? file.name : "Select Stat Data"}
                                        <input type="file" hidden onChange={handleFileUpload} />
                                      </Button>
                                    </span>
                                  </Tooltip>

                                  {/* Submit Button */}
                                  {file && (
                                    <>
                                      <Button variant="contained" color="primary" fullWidth sx={{ mt: 2, borderRadius: 10 }} onClick={handleSubmitStat}>
                                        Submit Stat Data
                                      </Button>
                                      <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2 }} display={'flex'}>
                                        <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                        <Typography variant="body2">{file.name} will be linked to {creator.phenotype} for this collaboration.</Typography>
                                      </Box>
                                    </>
                                  )}
                                </>
                              }
                              sx={{
                                '& .MuiListItemText-primary': {
                                  width: '100%',
                                  display: 'block'
                                },
                                '& .MuiListItemText-secondary': {
                                  width: '100%'
                                }
                              }}
                            />) : (
                              <Box sx={{ bgcolor: '#e8f1fa', p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                                <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                <Typography variant="body2">Waiting for Collaborators to upload their Stat data.</Typography>
                              </Box>
                            )}
                          </>
                        )}
                      </ListItem>
                    </>
                  </List>
                </Box>
              )}
              {collaboration?.stat_uploaded && (
                <Box sx={{ bgcolor: '#ffffff', mt: 2, p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                  <List sx={{ pt: 0 }}>
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="h2" sx={{ flexGrow: 1, fontSize: 20, fontWeight: 'bold' }}>
                          Experiment Results
                        </Typography>
                        <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                      </Box>
                      {(role === 'receiver' && !gwasResultsAvailable) && (
                        <Box sx={{ bgcolor: '#e8f1fa', mt: 2, p: 2, borderRadius: 2, border: 1, borderColor: '#85b1e6', gap: 2, width: '100%' }} display={'flex'}>
                          <InfoIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          <Typography variant="body2">Results will be available soon.</Typography>
                        </Box>
                      )}
                      {role === 'sender' && (
                        <ListItem disableGutters>
                          <ListItemText
                            secondary={
                              <Box
                                sx={{
                                  display: 'flex',
                                  gap: 2,
                                  mt: 1,
                                  width: '100%', // Ensure the Box takes full width of its parent
                                }}
                              >
                                <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      isGwasResultsEnabled
                                        ? 'Get Results'
                                        : !isGwasInitiateEnabled
                                          ? 'Calculation already Initiated'
                                          : role === 'receiver'
                                            ? 'Receiver cannot initiate calculations'
                                            : 'Initiate Calculations'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                      <Button
                                        variant={isGwasResultsEnabled ? "outlined" : "contained"}
                                        color={isGwasResultsEnabled ? "secondary" : "primary"}
                                        onClick={isGwasResultsEnabled ? handleGwasResults : handleGwasInitiate}
                                        disabled={
                                          (!isGwasInitiateEnabled && !isGwasResultsEnabled) ||
                                          role === 'receiver'
                                        }
                                        fullWidth
                                        sx={{ borderRadius: 20 }}
                                      >
                                        {isGwasResultsEnabled ? "Get GWAS Results" : "Initiate GWAS Calculation"}
                                      </Button>
                                    </span>
                                  </Tooltip>
                                </Box>

                                {/* GWAS Initiate Button */}
                                {/* <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      !isGwasInitiateEnabled
                                        ? 'GWAS Calculation already Initiated or Users yet to upload Stat Data'
                                        : role === 'receiver'
                                          ? 'Receiver cannot initiate QC calculations'
                                          : 'Initiate GWAS Calculations'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                      <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleGwasInitiate}
                                        disabled={!isGwasInitiateEnabled}
                                        fullWidth
                                        sx={{ borderRadius: 20 }}
                                      >
                                        Initiate GWAS Calculation
                                      </Button>
                                    </span>
                                  </Tooltip>
                                </Box> */}

                                {/* GWAS Results Button */}
                                {/* <Box sx={{ flex: 1 }}>
                                  <Tooltip
                                    arrow title={
                                      !isGwasResultsEnabled
                                        ? 'Results not available to preview' : role === 'receiver'
                                          ? 'Receiver cannot initiate GWAS results'
                                          : 'Get GWAS Results'
                                    }
                                    placement="bottom"
                                  >
                                    <span>
                                  <Button
                                    variant="outlined"
                                    color="secondary"
                                    onClick={handleGwasResults}
                                    // startIcon={
                                    //   isQcResultsLoading && (
                                    //     <CircularProgress size={20} color="inherit" />
                                    //   )
                                    // }
                                    fullWidth
                                    sx={{ borderRadius: 20 }}
                                  >
                                    Get Results
                                  </Button>
                                </span>
                                  </Tooltip>
                                </Box> */}
                              </Box>
                            }
                          />
                        </ListItem>
                      )}
                    </>
                    {(gwasResultsAvailable) && (
                      <Box sx={{ mt: 2 }}>
                        {/* <Typography variant="h6" gutterBottom>
                          <strong>GWAS Experiment</strong>
                        </Typography> */}

                        <Tabs
                          value={selectedTab}
                          onChange={(event, newValue) => {
                            if (selectedTab !== 0) {
                              setSelectedTab(newValue);
                            }
                          }}
                          variant="scrollable"
                          scrollButtons="auto"
                          sx={{
                            borderBottom: 1,
                            bgcolor: 'white',
                            border: 1,
                            borderRadius: 3,
                            borderColor: '#85b1e6'
                          }}
                        >
                          {placeholderTabs.map((tab, index) => (
                            selectedTab === 0 && index !== 0 ? (
                              <Tooltip key={index} title="Results not available" arrow>
                                <span>
                                  <Tab label={tab} disabled />
                                </span>
                              </Tooltip>
                            ) : (
                              <Tab key={index} label={tab} />
                            )
                          ))}
                        </Tabs>


                        {/* {gwasResultPreview.map((userData) => (
                          <Box key={userData.userId} sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, borderRadius: 2, border: 1, borderColor: '#85b1e6', p: 1 }}>
                              <Typography variant="title" sx={{ fontWeight: 'bold' }}>
                                {getUserName(userData.userId)} - SNP Results
                              </Typography>

                              <Button
                                variant="contained"
                                size="small"
                                color="primary"
                                sx={{ borderRadius: 10, fontSize: 10 }}
                                endIcon={<DownloadRounded />}
                                onClick={() => handleDownload(userData.userId, userData.sortedSnps)}
                              >
                                Download Results
                              </Button>
                            </Box>


                            <TableContainer sx={{ maxHeight: 400, overflow: "auto", borderRadius: 2, border: 1, borderColor: '#cccccc', marginTop: 2 }}>
                              <Table stickyHeader>
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>SNP</TableCell>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>Chi-Square</TableCell>
                                    <TableCell sx={{ backgroundColor: "#1876D1", color: "white", fontWeight: "bold", position: "sticky", top: 0, zIndex: 1 }} align='center'>P-Value</TableCell>
                                  </TableRow>
                                </TableHead>

                                <TableBody>
                                  {userData.sortedSnps.map((snp) => (
                                    <TableRow key={snp.snpKey}>
                                      <TableCell align='center'>{snp.snpKey}</TableCell>
                                      <TableCell align='center'>{snp.chi.toFixed(3)}</TableCell>
                                      <TableCell align='center'>{snp.pValue.toFixed(3)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        ))} */}

                        <Box sx={{ pt: 2 }}>
                          {selectedTab === 0 && (
                            <Box>
                              {gwasResultPreview
                                .filter(userData => userData.userId === currentUserId || userData.userId === "aggregated") // Keep only the current user and combined data
                                .map(userData => (
                                  <Box key={userData.userId} sx={{ mb: 4 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, borderBottom: 1, borderColor: 'divider', p: 1 }}>
                                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        {userData.userId === "aggregated" ? "Joint Results: Chi-Square" : `Individual Results: Chi-Square`}
                                      </Typography>
                                      <Button
                                        variant="contained"
                                        size="small"
                                        color="primary"
                                        sx={{ borderRadius: 10, fontSize: 10, boxShadow: 0 }}
                                        endIcon={<DownloadRounded />}
                                        onClick={() => handleDownload(userData.userId, userData.sortedSnps)}
                                      >
                                        Download Results
                                      </Button>
                                    </Box>
                                    <TableContainer sx={{ maxHeight: 400, overflow: 'auto', borderRadius: 2, border: 1, borderColor: '#a3c8ed', mt: 2 }}>
                                      <Table stickyHeader>
                                        <TableHead>
                                          <TableRow>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>SNP</TableCell>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>Chi-Square</TableCell>
                                            <TableCell align="center" sx={{ bgcolor: '#d1e4f6', color: '#0c3b69', fontWeight: 'bold' }}>P-Value</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {userData.sortedSnps.map(snp => (
                                            <TableRow key={snp.snpKey}>
                                              <TableCell align="center">{snp.snpKey}</TableCell>
                                              <TableCell align="center">{snp.chi.toFixed(3)}</TableCell>
                                              <TableCell align="center">{snp.pValue.toFixed(3)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                ))}
                            </Box>

                          )}
                          {selectedTab !== 0 && (
                            <Typography variant="body1">Placeholder content for {placeholderTabs[selectedTab]}</Typography>
                          )}
                        </Box>
                      </Box>
                    )}
                  </List>
                </Box>
              )}
              {/* Save and Cancel Buttons */}
              {/* {isEditing && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Tooltip arrow title="Save your changes" placement="top">
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SaveIcon />}
                      onClick={handleUpdateCollaboration}
                      sx={{ mr: 2 }}
                      disabled={isLoading}
                    >
                      {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Save'}
                    </Button>
                  </Tooltip>
                  <Tooltip arrow title="Cancel editing" placement="top">
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<CancelIcon />}
                      onClick={() => {
                        // Revert to original values
                        setCollabName(originalCollabName);
                        setExperimentList([...originalExperimentList]);
                        setPhenotype(originalPhenoType);
                        setSamples(originalSamples);
                        setIsEditing(false);
                      }}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </Tooltip>
                </Box>
              )} */}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', marginBottom: '20px', p: 0, boxShadow: 'none' }}>
            <CardContent sx={{ p: 0 }}>
              {/* Header */}
              <Box sx={{ bgcolor: '#ffffff', p: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    <strong>Collaborators</strong>
                  </Typography>
                  <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                </Box>
                <List>
                  <ListItem disableGutters>
                    <ListItemText
                      primary={`${senderInfo.name} (Initiator)`}
                    />
                  </ListItem>
                  <Divider sx={{ borderColor: 'primary.main' }} />

                  {invitedUsers.map((user, index) => (
                    <ListItem key={index} disableGutters sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ListItemText
                        primary={`${user.name} (Collaborator)`}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {role === 'sender' && user.status === 'pending' ? (
                          <Tooltip arrow title="Withdraw this invitation" placement="top">
                            <Button
                              variant="outlined"
                              color="secondary"
                              size="small"
                              onClick={() => handleWithdraw(user.user_id)}
                              sx={{ borderRadius: 10 }}
                            >
                              Withdraw
                            </Button>
                          </Tooltip>
                        ) : role === 'receiver' && user.status === 'pending' ? (
                          <>
                            <Tooltip arrow title="Accept this invitation" placement="top">
                              <Button
                                variant="contained"
                                color="primary"
                                size="small"
                                startIcon={<CheckCircleIcon />}
                                onClick={() => handleAccept(user.user_id)}
                                sx={{ mr: 1, borderRadius: 10 }}
                              >
                                Accept
                              </Button>
                            </Tooltip>
                            <Tooltip arrow title="Reject this invitation" placement="top">
                              <Button
                                variant="outlined"
                                color="primary"
                                size="small"
                                onClick={() => handleReject(user.user_id)}
                                startIcon={<CancelIcon />}
                                sx={{ borderRadius: 10 }}
                              >
                                Reject
                              </Button>
                            </Tooltip>
                          </>
                        ) : (
                          <StatusChip status={user.status} />
                        )}
                      </Box>
                    </ListItem>
                  ))}
                </List>
              </Box>
              <Box sx={{ bgcolor: '#ffffff', p: 2, mt: 2, borderRadius: 3, border: 1, borderColor: '#85b1e6' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    <strong>Collaboration Status</strong>
                  </Typography>
                  <Divider sx={{ flexGrow: 30, borderColor: 'primary.main' }} />
                </Box>
                {/*Will have the progress bar here*/}
                <Stepper activeStep={progressActiveStep} orientation="vertical">
                  {progressSteps.map((step, index) => (
                    <Step key={index}>
                      <StepLabel>{step.label}</StepLabel>
                      <StepContent>{step.description}</StepContent>
                    </Step>
                  ))}
                </Stepper>


              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* <Box mt={4}>
        <Tooltip arrow title="Save your collaboration details" placement="top">
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={handleUpdateCollaboration}
            disabled={isLoading || !isEditing} // Disable if not in edit mode
            sx={{ py: 2, fontSize: '1.1rem', borderRadius: 100 }}
          >
            {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Update Collaboration'}
          </Button>
        </Tooltip>
      </Box> */}

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container >
  );
};

const StatusChip = ({ status }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted':
        return { dot: alpha('#4caf50', 1.0), bg: alpha('#c8e6c9', 0.5) }; // Green
      case 'withdrawn':
        return { dot: alpha('#ff9800', 1.0), bg: alpha('#ffe0b2', 0.5) }; // Orange
      case 'rejected':
        return { dot: alpha('#f44336', 1.0), bg: alpha('#ffcdd2', 0.5) }; // Red
      default:
        return { dot: alpha('#1976d2', 1.0), bg: alpha('#bbdefb', 0.5) }; // Blue
    }
  };

  const { dot, bg } = getStatusColor(status);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: 10,
        padding: '4px 8px',
        marginLeft: 1,
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '100%',
          backgroundColor: dot,
          marginRight: 1,
        }}
      />
      <Typography variant="body2" color={dot}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Typography>
    </Box>
  );
};

export default CollaborationDetails;