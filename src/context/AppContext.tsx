import React, {createContext, useContext} from 'react';

interface AppContextType {
  resetApp:            () => void;
  showPermissionGuide: () => void;
}

export const AppContext = createContext<AppContextType>({
  resetApp:            () => {},
  showPermissionGuide: () => {},
});
export const useAppContext = () => useContext(AppContext);
