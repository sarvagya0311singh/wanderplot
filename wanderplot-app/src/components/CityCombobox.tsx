import React, { useState } from 'react';
import { useCombobox } from 'downshift';
import { MapPin, Search } from 'lucide-react';
import { IndianCity } from '@/data/indianCities';

interface CityComboboxProps {
  items: IndianCity[];
  value: string;
  onChange: (value: string, coords?: { lat: number; lng: number }) => void;
  placeholder?: string;
  icon?: React.ReactNode;
}

export default function CityCombobox({ items, value, onChange, placeholder = 'Search city...', icon }: CityComboboxProps) {
  const [inputItems, setInputItems] = useState<IndianCity[]>(items.slice(0, 8));

  const {
    isOpen,
    getToggleButtonProps,
    getLabelProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    items: inputItems,
    inputValue: value,
    onInputValueChange: ({ inputValue }) => {
      onChange(inputValue || '');
      if (!inputValue) {
        setInputItems(items.slice(0, 8));
        return;
      }
      
      const lower = inputValue.toLowerCase();
      // Match startsWith first, then includes
      const startsWith = items.filter(i => i.name.toLowerCase().startsWith(lower));
      const includes = items.filter(i => i.name.toLowerCase().includes(lower) && !i.name.toLowerCase().startsWith(lower));
      setInputItems([...startsWith, ...includes].slice(0, 8)); // Top 8 matches
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onChange(selectedItem.name, { lat: selectedItem.lat, lng: selectedItem.lng });
      }
    },
    itemToString: (item) => (item ? item.name : ''),
  });

  return (
    <div className="relative w-full">
      <label {...getLabelProps()} className="sr-only">Choose a city</label>
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
          {icon || <MapPin className="w-5 h-5" />}
        </div>
        <input
          {...getInputProps()}
          placeholder={placeholder}
          className="input-field !pl-12 !pr-11 w-full"
        />
        <button
          type="button"
          {...getToggleButtonProps()}
          aria-label="toggle menu"
          className="absolute right-4 text-gray-400 hover:text-gray-600"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      <ul
        {...getMenuProps()}
        className={`absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100
                    max-h-80 overflow-y-auto overscroll-contain
                    [scrollbar-width:thin] [scrollbar-color:theme(colors.gray.300)_transparent]
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-thumb]:rounded-full
                    [&::-webkit-scrollbar-thumb]:bg-gray-300
                    [&::-webkit-scrollbar-track]:bg-transparent
                    ${!(isOpen && (inputItems.length > 0 || value)) && 'hidden'}`}
      >
        {isOpen && inputItems.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-400">No cities found</li>
        )}
        {isOpen &&
          inputItems.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              {...getItemProps({ item, index })}
              className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 ${
                highlightedIndex === index ? 'bg-gray-50 text-brand' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MapPin className="w-4 h-4 opacity-50 flex-none" />
              <div className="flex flex-col">
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-gray-400">{item.state}</span>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
