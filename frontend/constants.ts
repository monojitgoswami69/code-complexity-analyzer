import { FileNode } from './types';

export const INITIAL_CODE = `/**
 * Complexity Analysis Target: QuickSort Implementation
 * @param {Array} arr - The input array to be sorted
 * @returns {Array} - The sorted array
 */

const quickSort = (arr) => {
  if (arr.length <= 1) {
    return arr;
  }

  const pivot = arr[arr.length - 1];
  const leftArr = [];
  const rightArr = [];

  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] < pivot) {
      leftArr.push(arr[i]);
    } else {
      rightArr.push(arr[i]);
    }
  }

  return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
};

export default quickSort;
`;

export const INITIAL_FILES: FileNode[] = [
  {
    id: '1',
    name: 'QuickSort.js',
    content: INITIAL_CODE,
    language: 'JavaScript'
  },
  {
    id: '2',
    name: 'BinarySearch.js',
    content: `function binarySearch(arr, target) {
  let left = 0;
  let right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}`,
    language: 'JavaScript'
  }
];
