
export function findContiguousBlocks(arr: any[]) {
  const blocks = [];
  let start = -1;
  
  for (let i = 0; i < arr.length; i++) {
    // If we find a truthy value and we're not already in a block, mark the start
    if (arr[i] && start === -1) {
      start = i;
    }
    
    // If we find a falsy value and we were in a block, or we're at the end of the array and in a block
    if ((!arr[i] || i === arr.length - 1) && start !== -1) {
      // If we're at the end of the array and the last element is truthy, we need to include it
      const end = arr[i] ? i : i - 1;
      blocks.push([start, end]);
      start = -1; // Reset start to indicate we're not in a block
    }
  }
  
  return blocks;
}


export function decompose(chunk: string) {
  const content = chunk.trimEnd();
  const trailingWhitespace = chunk.slice(content.length);
  // formatting content is: leading whitespace, -, *, or # / ## / ...
  // content is: everything else
  const splits = /^([\s\d\-\*\#\.]*)(.*)$/.exec(content);
  if (splits) {
    return {format: splits[1], content: splits[2], trailingWhitespace};
  } else {
    console.warn('Failed to decompose chunk:', chunk);
    return {format: '', content: content, trailingWhitespace};
  }
}
