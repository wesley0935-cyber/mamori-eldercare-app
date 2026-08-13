import React, {createContext, useContext} from 'react';

interface AppContextType {
  resetApp:            () => void;
  showPermissionGuide: () => void;
  logoutFamily:        () => void;
}

export const AppContext = createContext<AppContextType>({
  resetApp:            () => {},
  showPermissionGuide: () => {},
  logoutFamily:        () => {},
});
export const useAppContext = () => useContext(AppContext);
