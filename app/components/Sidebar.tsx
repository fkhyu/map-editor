const Sidebar = () => {  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-cente justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div id="sidebar" className="absolute flex top-0 left-0 right-0 bottom-0 w-1/6 p-4 bg-gray-100 dark:bg-gray-900 min-w-[250px] m-4 h-[calc(100vh-2rem)] rounded-xl z-10">
        <ul className="w-full flex flex-col gap-1 text-[17px]">
          <li className="py-2 px-4 h-fit rounded-md w-full hover:bg-gray-200 dark:hover:bg-gray-800">
            <a href="/">Dash</a>
          </li>
          <li className="py-2 px-4 h-fit rounded-md w-full hover:bg-gray-200 dark:hover:bg-gray-800">
            <a href="/editor">Map Editor</a>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Sidebar;