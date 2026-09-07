import PdiReportsTable from '../shared/PdiReportsTable';

export default function PdiPage({ socket, userRole }) {
  return <PdiReportsTable socket={socket} userRole={userRole} title="PDI Reports" />;
}
