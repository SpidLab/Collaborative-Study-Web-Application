export const appConfig = {
    applicationId: 'ar-s-progressiveemployeestressapp',
    namespace: 'progressiveemployeestore',
    hatCluster: '.hubat.net',
    hatApiVersion: 'v2.6',
    secure: false,
}

export interface HatClientConfig {
    apiVersion?: string; // Api Version for the HAT. eg. v2.6
    hatDomain?: string; // The HAT domain of the user. eg. testing.hubat.net
    token?: string; // The Application token.
    secure?: boolean; // If you want to run the HAT locally, you have to modify this field to 'false'.
    onTokenChange?: Function;
}