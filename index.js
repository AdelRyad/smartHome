/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Global error handler for uncaught errors
const errorHandler = ( error, isFatal ) =>
{
    console.error( isFatal ? 'Fatal Error:' : 'Error:', error );
};

// Set up global error handler
ErrorUtils.setGlobalHandler( errorHandler );

// Handle unhandled promise rejections
if ( global.addEventListener )
{
    global.addEventListener( 'unhandledrejection', ( { reason } ) =>
    {
        console.error( 'Unhandled promise rejection:', reason );
    } );
}

// Disable specific LogBox warnings that are not critical
LogBox.ignoreLogs( [
    'new NativeEventEmitter',
    'Require cycle:',
    'Remote debugger',
] );

// Register the app
AppRegistry.registerComponent( appName, () => App );
