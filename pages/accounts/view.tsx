import React, { useEffect, useState } from 'react';

const AccountView: React.FC = () => {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setId(qs.get('id'));
  }, []);

  if (!id) return <div>Missing account ID.</div>;

  return (
    <div>
      <h1>Transactions for account: {id}</h1>
      {/* Display filtered transactions here */}
    </div>
  );
};

export default AccountView;
