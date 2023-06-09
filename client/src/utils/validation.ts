const EMAIL_REGEX = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(([[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
const HAT_NAME_REGEX = /^[a-z][a-z0-9]{2,19}[a-z0-9]$/;

/**
 * Check if the email is valid.
 *
 * @param email
 * @returns {boolean}
 */
export const isEmail = (email: any) => {
  return EMAIL_REGEX.test(email);
};

/**
 * Check if the HAT name is valid.
 *
 * @param hatName
 * @returns {boolean}
 */
export const isHatName = (hatName: any) => {
  return HAT_NAME_REGEX.test(hatName);
};
