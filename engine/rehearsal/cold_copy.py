"""Private stopped-ledger copies and archive extraction, with bounded links.

Uses the absolute snapshot-link rebasing already exercised by engine/build/
worker.py. No processes, keys, public networks or source ledger writes.
"""
from pathlib import Path,PurePosixPath
import hashlib,json,os,posixpath,shutil,stat,tarfile

def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def inventory(source):
    source=Path(source).resolve();assert source.is_dir()
    rows=[];links=[]
    for path in sorted(source.rglob('*')):
        mode=path.lstat().st_mode;relative=path.relative_to(source).as_posix()
        if stat.S_ISSOCK(mode):
            assert path==source/'admin.rpc','Unexpected ledger socket';continue
        if path.is_symlink():
            target=path.resolve(strict=False)
            assert target.is_relative_to(source),'Ledger link escapes its source'
            assert target.exists(),'Missing linked ledger state'
            target_relative=target.relative_to(source).as_posix()
            links.append((Path(relative),Path(target_relative)))
            rows.append({'path':relative,'type':'link','target':target_relative})
        elif stat.S_ISREG(mode):rows.append({'path':relative,'type':'file','bytes':path.stat().st_size,'sha256':sha(path)})
        elif stat.S_ISDIR(mode):rows.append({'path':relative,'type':'directory'})
        else:raise RuntimeError('Unexpected ledger special file')
    digest=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {'sha256':digest,'entries':len(rows),'links':len(links)},links

def copy_cold_ledger(source,destination):
    source=Path(source).resolve();destination=Path(destination).resolve()
    assert not destination.exists() and not destination.is_relative_to(source) and not source.is_relative_to(destination),'Disjoint new destination required'
    before,links=inventory(source)
    def transient(directory,names):
        return ['admin.rpc'] if Path(directory)==source and 'admin.rpc' in names and stat.S_ISSOCK((source/'admin.rpc').lstat().st_mode) else []
    shutil.copytree(source,destination,symlinks=True,ignore=transient)
    for relative,target in links:
        link=destination/relative;link.unlink();link.symlink_to(destination/target)
    after,_=inventory(destination);assert before==after,'Copied ledger bytes differ'
    return after

def archive_backup(backup,archive):
    backup=Path(backup).resolve();archive=Path(archive)
    assert not archive.exists()
    def normalize(member):
        if member.issym():
            target=Path(member.linkname)
            if not target.is_absolute():target=(backup/member.name).parent/target
            target=target.resolve(strict=False)
            assert target.is_relative_to(backup),'Archive link escapes backup'
            member.linkname=os.path.relpath(target,(backup/member.name).parent)
        return member
    with tarfile.open(archive,'w') as tar:
        for name in ['ledger-0','ledger-1']:tar.add(backup/name,arcname=name,filter=normalize)
    return {'sha256':sha(archive),'bytes':archive.stat().st_size}

def extract_backup(archive,destination,expected_sha):
    destination=Path(destination).resolve()
    assert not destination.exists() and sha(archive)==expected_sha,'New destination and matching archive required'
    with tarfile.open(archive,'r') as tar:
        members=tar.getmembers();assert 0<len(members)<=100000
        assert sum(m.size for m in members)<=4*1024**3,'Archive exceeds private rehearsal bound'
        names=set();links=set()
        for m in members:
            p=PurePosixPath(m.name)
            assert not p.is_absolute() and '..' not in p.parts and p.parts and p.parts[0] in ('ledger-0','ledger-1') and p.as_posix()==m.name.rstrip('/') and p.as_posix() not in names,'Unsafe archive member'
            assert m.size>=0,'Negative archive size'
            names.add(p.as_posix())
            assert m.isfile() or m.isdir() or m.issym(),'Unsafe archive file type'
            if m.issym():
                assert not PurePosixPath(m.linkname).is_absolute(),'Absolute archive link refused'
                target=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname))
                assert target.split('/')[0]==p.parts[0] and not target.startswith('../'),'Archive link escapes its ledger'
                links.add(p.as_posix())
        for name in names:
            assert not any(parent.as_posix() in links for parent in PurePosixPath(name).parents),'Archive entry below a symlink refused'
        destination.mkdir(mode=0o700)
        # Portable bounded extraction: older worker Python has no data_filter.
        # Never call unrestricted extractall. Write owner-only regular files
        # before creating any symlinks, after validating the entire inventory.
        def private_dirs(path):
            current=destination
            for part in path.relative_to(destination).parts:
                current=current/part;current.mkdir(mode=0o700,exist_ok=True)
        for m in members:
            path=destination/m.name
            if m.isdir():private_dirs(path)
            elif m.isfile():
                private_dirs(path.parent)
                stream=tar.extractfile(m);assert stream is not None
                with stream,os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as output:
                    shutil.copyfileobj(stream,output)
                assert path.stat().st_size==m.size,'Extracted file length differs'
        for m in members:
            if m.issym():
                path=destination/m.name;private_dirs(path.parent);path.symlink_to(m.linkname)
    return [inventory(destination/('ledger-'+str(i)))[0] for i in range(2)]
