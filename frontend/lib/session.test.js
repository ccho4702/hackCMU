import {beforeEach,expect,it} from 'vitest';
import {setUser,setGuestUser,getUser,clearUser,coachingStorage,pipelineUserId,safeNextPath} from './session';
const guest=id=>({user_id:id,name:'Guest',email:null,is_guest:true});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});

it('guest mode does not inherit or overwrite a signed-in profile’s last recording',()=>{
  setUser({user_id:'registered',name:'Alice',email:'alice@example.test'});
  localStorage.setItem('rehearse.lastRun','registered-run');
  setGuestUser(guest('guest-a'));
  expect(getUser().is_guest).toBe(true);
  expect(pipelineUserId()).toBe('guest-a');
  expect(coachingStorage().getItem('rehearse.lastRun')).toBeNull();
  coachingStorage().setItem('rehearse.lastRun','guest-run');
  expect(localStorage.getItem('rehearse.lastRun')).toBe('registered-run');
  expect(JSON.parse(localStorage.getItem('rehearse.user')).user_id).toBe('registered');
  clearUser();
  expect(getUser().user_id).toBe('registered');
});

it('a late response for a previous guest cannot populate a new guest’s state',()=>{
  setGuestUser(guest('guest-a'));
  const firstStorage=coachingStorage();
  clearUser();
  setGuestUser(guest('guest-b'));
  firstStorage.setItem('rehearse.lastRun','old-guest-run');
  expect(coachingStorage().getItem('rehearse.lastRun')).toBeNull();
  expect(pipelineUserId()).toBe('guest-b');
});

it('signing in switches back to the registered profile and clears the active guest session',()=>{
  setGuestUser(guest('guest-a'));coachingStorage().setItem('rehearse.lastRun','guest-run');
  setUser({user_id:'registered',name:'Alice',email:'alice@example.test'});
  expect(getUser().is_guest).toBeUndefined();
  expect(sessionStorage.getItem('optune.guest')).toBeNull();
  expect(coachingStorage().getItem('rehearse.lastRun')).toBeNull();
});

it('return paths stay on this app while preserving query strings',()=>{
  expect(safeNextPath('/practice?run=abc#words')).toBe('/practice?run=abc#words');
  for(const target of ['//outside.example','/\\outside.example','https://outside.example','javascript:alert(1)'])expect(safeNextPath(target)).toBe('/');
});
