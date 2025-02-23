import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
