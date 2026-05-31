import React from 'react';

const GoalItem: React.FC<{ 
  name: string; 
  price: number; 
  image_url?: string; 
  item_url?: string; 
}> = ({ name, price, image_url, item_url }) => {
  const formattedPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);

  return (
    <div className="bg-white dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl overflow-hidden transition-all duration-300 border-2 border-black/5 dark:border-white/10 shadow-md hover:shadow-xl hover:scale-[1.02]">
      <div className="aspect-square w-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        {image_url && (
          <img 
            src={image_url} 
            alt={`Image of ${name}`} 
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
          />
        )}
      </div>
      <div className="p-5">
        <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate" title={name}>{name}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{formattedPrice}</p>
        {item_url && (
          <a 
            href={item_url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="mt-4 inline-block text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            View Item
          </a>
        )}
      </div>
    </div>
  );
};

export default GoalItem;
