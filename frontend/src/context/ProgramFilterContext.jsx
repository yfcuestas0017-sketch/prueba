import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import api from '../lib/api';
import { userIsGeneralAdmin } from '../lib/roles';

const ProgramFilterContext = createContext(null);

export function ProgramFilterProvider({ children }) {
  const { user } = useAuth();
  const [selectedProgram, setSelectedProgram] = useState('all');
  const [programs, setPrograms] = useState([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  const isAdminGeneral = userIsGeneralAdmin(user);

  useEffect(() => {
    let mounted = true;
    const loadPrograms = async () => {
      setLoadingPrograms(true);
      try {
        const catalogs = await api.getCatalogs();
        if (mounted) {
          const fetchedPrograms = Array.isArray(catalogs?.programs) ? catalogs.programs : [];
          setPrograms(fetchedPrograms);
        }
      } catch (err) {
        console.error('Error al cargar programas para filtro global:', err);
        if (mounted) setPrograms([]);
      } finally {
        if (mounted) setLoadingPrograms(false);
      }
    };

    loadPrograms();
    return () => { mounted = false; };
  }, []);

  return (
    <ProgramFilterContext.Provider
      value={{
        selectedProgram,
        setSelectedProgram,
        programs: Array.isArray(programs) ? programs : [],
        loadingPrograms,
        isAdminGeneral,
      }}
    >
      {children}
    </ProgramFilterContext.Provider>
  );
}

export function useProgramFilter() {
  const ctx = useContext(ProgramFilterContext);
  if (!ctx) {
    return {
      selectedProgram: 'all',
      setSelectedProgram: () => {},
      programs: [],
      loadingPrograms: false,
      isAdminGeneral: false,
    };
  }
  return ctx;
}
