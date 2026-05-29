import React from 'react';

const GoalItem = ({ name, price, imageUrl, itemUrl }) => {
  return (
    <div>
      <img src={imageUrl} alt={name} />
      <h3>{name}</h3>
      <p>{price}</p>
      <a href={itemUrl}>View Item</a>
    </div>
  );
};

export default GoalItem;
