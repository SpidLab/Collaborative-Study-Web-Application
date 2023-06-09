import React, { useState } from 'react';
import { useStateValue } from '../state/state';
import { appConfig } from '../utils/dataswift.config'
import { isEmail, isHatName } from '../utils/validation'
import { Stack } from '@mui/material'
import { useNavigate } from 'react-router-dom';

/**
 * PDARegistration
 *
 * This is the Registration Page of our App, it is accessible at the '/signup' route.
 *
 */

const PDARegistration = () => {
    const initUser = {
        pda_username: '',
        pda_email: '',
    };

    const [user, setUser] = useState(initUser);
    const [, dispatch] = useStateValue()

    const errorMessages = {
        usernameNotValid: 'Sorry, this username is not valid',
        emailNotRecognised: 'Sorry, email is not valid',
    };

    const navigateToHatters = () => {
        const redirectUrl = `http://${window.location.host}/authentication`;
        const applicationId = appConfig.applicationId;
        dispatch({ type: "SET_PDA_USERNAME", payload: user.pda_username })

        window.location.href = `https://hatters.dataswift.io/services/baas/signup?email=${user.pda_email}&hat_name=${user.pda_username}&application_id=${applicationId}&redirect_uri=${redirectUrl}&lang=en`;
    };

    // eslint-disable-next-line no-unused-vars
    const handleChange = (event: any) => {
        const name = event.target.name;
        const value = event.target.value;

        setUser({ ...user, [name]: value });
    };

    const handleSubmit = (event: any) => {
        event.preventDefault();
        validateSignupDetails();
    };

    const validateSignupDetails = () => {
        let errorMsg = '';

        if (!isHatName(user.pda_username)) {
            errorMsg = errorMessages.usernameNotValid;
        } else if (!isEmail(user.pda_email)) {
            errorMsg = errorMessages.emailNotRecognised;
        } else {
            navigateToHatters();
        }

        if (errorMsg) {
            dispatch({ type: "SET_NOTIFICATION_MESSAGE", payload: { message: errorMsg, alertType: "error" } })
        }
    };

    return (
        <Stack display={"flex"} justifyContent={"center"} alignItems={"center"}>
            <form onSubmit={e => handleSubmit(e)}>
                <h3>Please also create a Dataswift Personal Data Account at: </h3>
                <p>
                    <a href="https://hatters.dataswift.io/sandbox" target="_blank" rel="noopener noreferrer">
                        https://hatters.dataswift.io/sandbox
                    </a>
                </p>
            </form>
        </Stack>
    )
}

export default PDARegistration
