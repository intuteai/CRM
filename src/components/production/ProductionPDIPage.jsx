import React from 'react';
import PdiReportsTable from '../shared/PdiReportsTable';

export default function ProductionPDIPage({ socket, userRole }) {
  return <PdiReportsTable socket={socket} userRole={userRole} title="Production PDI Reports" />;
}
